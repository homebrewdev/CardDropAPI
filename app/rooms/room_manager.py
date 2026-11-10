import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import List, Optional, Dict

from fastapi import WebSocket
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Session, Player, Card, PlayerCard, Round, RoundAction
from app.schemas.schemas import (
    PlayerCardResponse,
    CardResponse,
)

logger = logging.getLogger(__name__)

# Правила игры
CARDS_PER_PLAYER = 13
MIN_PLAYERS = 2
MAX_PLAYERS = 4
DEFAULT_ANTE = 100
MIN_ANTE = 1
MAX_ANTE = 10000

# Кто забирает банк, если карт в руке не осталось, а старшей карты на столе нет
NO_LEADER_ORDER = "lowest"

# Сколько последних сыгранных карт показывать на столе
TABLE_CARDS_LIMIT = 4


def utcnow() -> datetime:
    """Наивный UTC timestamp — колонки DateTime в схеме без таймзон"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class GameActionError(Exception):
    """Игровое действие отклонено правилом. error_type уходит в WS-ответ."""

    def __init__(self, message: str, error_type: str = "rule_violation"):
        super().__init__(message)
        self.message = message
        self.error_type = error_type


class RoomConnection:
    """Подключённый WS-клиент"""

    def __init__(self, player_id: int, join_code: str, websocket: WebSocket):
        self.player_id = player_id
        self.join_code = join_code
        self.websocket = websocket


class RoomManager:
    """Управление комнатами в памяти + операции с БД"""

    def __init__(self):
        # join_code -> {player_id: RoomConnection}
        self.rooms: Dict[str, Dict[int, RoomConnection]] = {}
        # player_id -> RoomConnection (для быстрого поиска)
        self._player_to_room: Dict[int, RoomConnection] = {}
        # player_id -> uuid последнего обработанного действия (идемпотентность)
        self._processed_actions: Dict[int, str] = {}
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Подключение / отключение
    # ------------------------------------------------------------------

    async def join(
        self, join_code: str, player: Player, db: AsyncSession, websocket: WebSocket
    ) -> RoomConnection:
        """Игрок входит в комнату"""
        async with self._lock:
            if join_code not in self.rooms:
                self.rooms[join_code] = {}

            conn = RoomConnection(player.id, join_code, websocket)
            self.rooms[join_code][player.id] = conn
            self._player_to_room[player.id] = conn
            # current_players в БД не хранится: API считает его по списку игроков

            await self._broadcast(
                join_code,
                {
                    "type": "player_joined",
                    "player_id": player.id,
                    "nickname": player.nickname,
                    "current_players": len(self.rooms[join_code]),
                },
                exclude=player.id,
            )

            state = await self._build_state(join_code, player.id, db)
            await websocket.send_json(state)

            return conn

    async def leave(self, player_id: int, db: AsyncSession):
        """Игрок покидает комнату.

        Если партия идёт, отсутствие за столом приравнивается к сдаче:
        карты сбрасываются, банк остаётся на столе и разыгрывается без него.
        """
        async with self._lock:
            conn = self._player_to_room.get(player_id)
            if not conn:
                return

            join_code = conn.join_code
            if join_code in self.rooms and player_id in self.rooms[join_code]:
                del self.rooms[join_code][player_id]
                if not self.rooms[join_code]:
                    del self.rooms[join_code]
            self._player_to_room.pop(player_id, None)
            self._processed_actions.pop(player_id, None)

            result = await db.execute(
                select(Session).where(Session.join_code == join_code)
            )
            session = result.scalar_one_or_none()

            if session and session.status == "playing":
                await db.execute(
                    update(Player).where(Player.id == player_id).values(folded=1)
                )
                await db.commit()
                await self._advance_if_stalled(join_code, db)

            await self._broadcast(
                join_code, {"type": "player_left", "player_id": player_id}
            )

    async def broadcast(self, player_id: int, data: dict):
        """Отправить всем в комнате игрока, кроме него"""
        conn = self._player_to_room.get(player_id)
        if not conn:
            return
        await self._broadcast(conn.join_code, data, exclude=player_id)

    async def broadcast_all(self, player_id: int, data: dict):
        """Отправить всем в комнате игрока, включая его"""
        conn = self._player_to_room.get(player_id)
        if not conn:
            return
        await self._broadcast(conn.join_code, data)

    async def send_to(self, player_id: int, data: dict) -> bool:
        """Отправить конкретному игроку"""
        conn = self._player_to_room.get(player_id)
        if conn:
            try:
                await conn.websocket.send_json(data)
                return True
            except Exception:
                logger.exception(f"Failed to send to player {player_id}")
                return False
        return False

    # ------------------------------------------------------------------
    # Вспомогательные проверки
    # ------------------------------------------------------------------

    def _check_idempotent(self, player_id: int, client_action_id: str) -> bool:
        """True, если такое действие от этого игрока уже обработано"""
        if not client_action_id:
            return False
        return self._processed_actions.get(player_id) == client_action_id

    def _mark_action(self, player_id: int, client_action_id: str):
        if client_action_id:
            self._processed_actions[player_id] = client_action_id

    def _connected_ids(self, join_code: str) -> List[int]:
        return sorted(self.rooms.get(join_code, {}).keys())

    async def _get_session_by_player(self, player_id: int, db: AsyncSession) -> Session:
        result = await db.execute(select(Player).where(Player.id == player_id))
        player = result.scalar_one_or_none()
        if not player:
            raise GameActionError("Player not found", "not_found")
        result = await db.execute(
            select(Session).where(Session.id == player.session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise GameActionError("Session not found", "not_found")
        return session

    async def _current_round(self, session_id: int, db: AsyncSession) -> Optional[Round]:
        result = await db.execute(
            select(Round)
            .where(Round.session_id == session_id)
            .order_by(Round.round_number.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _hand_size(self, player_id: int, db: AsyncSession) -> int:
        result = await db.execute(
            select(PlayerCard).where(
                PlayerCard.player_id == player_id,
                PlayerCard.played_at.is_(None),
            )
        )
        return len(result.scalars().all())

    # ------------------------------------------------------------------
    # Ставки и старт партии
    # ------------------------------------------------------------------

    async def handle_set_bet(self, player_id: int, bet: int, db: AsyncSession) -> dict:
        """Изменить собственную ставку.

        Банк (session.ante) = сумма ставок всех игроков партии.
        После старта партии повышение банка запрещено правилами.
        """
        session = await self._get_session_by_player(player_id, db)

        if session.status != "waiting":
            raise GameActionError(
                "Нельзя повышать банк: партия уже началась", "bank_locked"
            )
        if not MIN_ANTE <= bet <= MAX_ANTE:
            raise GameActionError(
                f"Ставка должна быть от {MIN_ANTE} до {MAX_ANTE}", "invalid_bet"
            )

        await db.execute(update(Player).where(Player.id == player_id).values(bet=bet))
        await self._recalc_ante(session, db)

        await self._broadcast(
            session.join_code,
            {"type": "bets_updated", "player_id": player_id, "bet": bet},
        )
        return {"type": "bets_updated", "player_id": player_id, "bet": bet}

    async def _recalc_ante(self, session: Session, db: AsyncSession):
        """Банк = сумма ставок всех игроков сессии (до старта партии)"""
        result = await db.execute(select(Player).where(Player.session_id == session.id))
        players = result.scalars().all()
        session.ante = sum(p.bet or 0 for p in players)
        await db.commit()

    async def handle_ready(self, player_id: int, db: AsyncSession) -> dict:
        """Обработка нажатия 'готов'"""
        session = await self._get_session_by_player(player_id, db)
        if session.status != "waiting":
            raise GameActionError("Партия уже началась", "invalid_state")

        await db.execute(update(Player).where(Player.id == player_id).values(is_ready=1))
        await db.commit()
        return {"type": "player_ready", "player_id": player_id, "is_ready": True}

    async def start_round(
        self, join_code: str, db: AsyncSession, ante: Optional[int] = None
    ) -> dict:
        """Начать новую партию: зафиксировать банк, раздать по 13 карт.

        ante — ставка игрока, который нажал «Играть». Игроки без ставки
        получают DEFAULT_ANTE, чтобы банк был ненулевым.
        """
        result = await db.execute(select(Session).where(Session.join_code == join_code))
        session = result.scalar_one_or_none()
        if not session:
            raise GameActionError("Session not found", "not_found")

        if session.status == "playing":
            raise GameActionError(
                "Нельзя повышать банк: партия уже началась", "bank_locked"
            )
        if session.status == "cancelled":
            raise GameActionError("Сессия отменена", "invalid_state")

        connected = self._connected_ids(join_code)
        if len(connected) < MIN_PLAYERS:
            raise GameActionError(
                f"Для старта нужно минимум {MIN_PLAYERS} подключённых игрока",
                "not_enough_players",
            )
        if len(connected) > MAX_PLAYERS:
            raise GameActionError(
                f"Максимальное количество игроков — {MAX_PLAYERS}", "too_many_players"
            )

        # Играют только подключённые и ещё «богатые» игроки
        result = await db.execute(
            select(Player)
            .where(Player.session_id == session.id, Player.id.in_(connected))
            .order_by(Player.id)
        )
        players = [p for p in result.scalars().all() if p.score != 0]
        if len(players) < MIN_PLAYERS:
            raise GameActionError("Игроков с средствами меньше двух", "not_enough_funds")

        # Ставка инициатора применяется к первому игроку, остальные добирают дефолт
        if ante is not None:
            if not MIN_ANTE <= ante <= MAX_ANTE:
                raise GameActionError(
                    f"Ставка должна быть от {MIN_ANTE} до {MAX_ANTE}", "invalid_bet"
                )
            if session.games_played == 0:
                await db.execute(
                    update(Player).where(Player.id == players[0].id).values(bet=ante)
                )
        # Ставка списывается с баланса и уходит в банк; больше баланса поставить нельзя
        for p in players:
            if not p.bet:
                p.bet = DEFAULT_ANTE
            p.bet = min(p.bet, p.score)
            p.score -= p.bet
        await db.commit()

        # Банк партии фиксируется: повышать его после старта нельзя
        session.ante = sum(p.bet for p in players)
        session.status = "playing"
        await db.commit()

        last_round = await self._current_round(session.id, db)
        next_number = (last_round.round_number + 1) if last_round else 1

        # Первым ходит победитель прошлой партии, иначе — первый по id
        result = await db.execute(
            select(Player).where(
                Player.session_id == session.id,
                Player.nickname == session.winner_nickname,
            )
        )
        previous_winner = result.scalar_one_or_none()
        ids = [p.id for p in players]
        first_player_id = (
            previous_winner.id
            if previous_winner is not None and previous_winner.id in ids
            else ids[0]
        )

        new_round = Round(
            session_id=session.id,
            round_number=next_number,
            status="active",
            started_at=utcnow(),
            dealer_id=first_player_id,
            current_turn_player_id=first_player_id,
        )
        db.add(new_round)
        await db.commit()
        await db.refresh(new_round)

        # Сброс предыдущих рук и флагов сдачи, иначе карты накапливаются между партиями
        result = await db.execute(
            select(PlayerCard).where(PlayerCard.played_at.is_(None))
        )
        for pc in result.scalars().all():
            await db.delete(pc)
        for p in players:
            p.folded = 0
        await db.commit()

        result = await db.execute(select(Card).order_by(Card.id))
        cards = list(result.scalars().all())
        if len(cards) < CARDS_PER_PLAYER * len(players):
            raise GameActionError(
                "В базе нет карт. Загрузи справочник: mysql < db_seed_cards.sql",
                "empty_deck",
            )
        random.shuffle(cards)

        card_idx = 0
        for player in players:
            for order in range(CARDS_PER_PLAYER):
                card = cards[card_idx]
                db.add(
                    PlayerCard(
                        player_id=player.id,
                        card_id=card.id,
                        hand_order=order,
                    )
                )
                card_idx += 1
        await db.commit()

        await self._broadcast_states(join_code, db)
        await self._broadcast(
            join_code,
            {
                "type": "round_started",
                "round_number": next_number,
                "cards_per_player": CARDS_PER_PLAYER,
                "ante": session.ante,
                "current_player_id": first_player_id,
            },
        )
        return {
            "type": "round_started",
            "round_number": next_number,
            "cards_per_player": CARDS_PER_PLAYER,
            "ante": session.ante,
            "current_player_id": first_player_id,
        }

    # ------------------------------------------------------------------
    # Ходы
    # ------------------------------------------------------------------

    async def handle_play_card(
        self,
        player_id: int,
        card_id: int,
        client_action_id: str,
        db: AsyncSession,
    ) -> dict:
        """Ход картой: карта обязана быть старше старшей на столе"""
        if self._check_idempotent(player_id, client_action_id):
            session = await self._get_session_by_player(player_id, db)
            return await self._build_state(session.join_code, player_id, db)

        session = await self._get_session_by_player(player_id, db)
        if session.status != "playing":
            raise GameActionError("Партия не идёт", "invalid_state")

        round_obj = await self._current_round(session.id, db)
        if not round_obj or round_obj.status != "active":
            raise GameActionError("Активного раунда нет", "invalid_state")
        if round_obj.is_closed:
            raise GameActionError("Раунд закрыт — нужна переигровка", "round_closed")

        result = await db.execute(select(Player).where(Player.id == player_id))
        player = result.scalar_one_or_none()
        if player.folded:
            raise GameActionError("Ты сбросил карты в этом раунде", "folded")
        if round_obj.current_turn_player_id != player_id:
            raise GameActionError("Сейчас не твой ход", "not_your_turn")

        result = await db.execute(
            select(PlayerCard).where(
                PlayerCard.player_id == player_id,
                PlayerCard.card_id == card_id,
                PlayerCard.played_at.is_(None),
            )
        )
        pc = result.scalar_one_or_none()
        if not pc:
            raise GameActionError("Invalid card or already played", "invalid_card")

        result = await db.execute(select(Card).where(Card.id == card_id))
        card = result.scalar_one_or_none()
        if not card:
            raise GameActionError("Unknown card", "invalid_card")

        # Сравнение со старшей картой на столе.
        # Раунд со стартовой серией равных карт (is_tiebreak) открыт для любого хода.
        if round_obj.current_power is not None and not round_obj.is_tiebreak:
            if card.power <= round_obj.current_power:
                raise GameActionError(
                    f"Нужна карта сильнее {round_obj.current_power}", "card_not_beaten"
                )

        pc.played_at = utcnow()
        db.add(
            RoundAction(
                round_id=round_obj.id,
                player_id=player_id,
                player_card_id=pc.id,
                action_type="play",
                client_action_id=client_action_id,
                metadata_json={"power": card.power, "tiebreak": bool(round_obj.is_tiebreak)},
            )
        )

        # Открытая карта становится старшей на столе
        round_obj.current_power = card.power
        round_obj.leader_player_id = player_id
        round_obj.is_tiebreak = 0
        self._mark_action(player_id, client_action_id)
        await db.commit()

        if await self._hand_size(player_id, db) == 0:
            round_obj.is_closed = 1
            await db.commit()
            await self._resolve_round(session, round_obj, db)
        else:
            await self._advance_turn(session, round_obj, db, actor_id=player_id)

        await self._broadcast_states(session.join_code, db)
        return await self._build_state(session.join_code, player_id, db)

    async def handle_fold(
        self,
        player_id: int,
        client_action_id: str,
        db: AsyncSession,
        action_type: str = "discard",
    ) -> dict:
        """Сдача: игрок сбрасывает карты и выбывает из раунда.

        Старшая карта на столе остаётся, банк разыгрывается без сдавшегося.
        """
        if self._check_idempotent(player_id, client_action_id):
            session = await self._get_session_by_player(player_id, db)
            return await self._build_state(session.join_code, player_id, db)

        session = await self._get_session_by_player(player_id, db)
        if session.status != "playing":
            raise GameActionError("Партия не идёт", "invalid_state")

        round_obj = await self._current_round(session.id, db)
        if not round_obj or round_obj.status != "active" or round_obj.is_closed:
            raise GameActionError("Раунд не принимает сдачу", "invalid_state")

        result = await db.execute(select(Player).where(Player.id == player_id))
        player = result.scalar_one_or_none()
        if player.folded:
            raise GameActionError("Ты уже сбросил карты", "already_folded")
        if round_obj.current_turn_player_id != player_id:
            raise GameActionError("Сейчас не твой ход", "not_your_turn")

        result = await db.execute(
            select(PlayerCard).where(
                PlayerCard.player_id == player_id,
                PlayerCard.played_at.is_(None),
            )
        )
        to_discard = result.scalars().all()
        discarded = len(to_discard)
        for pc in to_discard:
            await db.delete(pc)

        player.folded = 1
        db.add(
            RoundAction(
                round_id=round_obj.id,
                player_id=player_id,
                action_type=action_type,
                client_action_id=client_action_id,
                metadata_json={"discarded": discarded},
            )
        )
        self._mark_action(player_id, client_action_id)
        await db.commit()

        await self._broadcast(
            session.join_code,
            {
                "type": "player_folded",
                "player_id": player_id,
                "nickname": player.nickname,
                "discarded": discarded,
            },
        )
        await self._advance_if_stalled(session.join_code, db)
        await self._broadcast_states(session.join_code, db)
        return await self._build_state(session.join_code, player_id, db)

    # ------------------------------------------------------------------
    # Переход хода и завершение раунда
    # ------------------------------------------------------------------

    async def _advance_turn(
        self, session: Session, round_obj: Round, db: AsyncSession, actor_id: int
    ):
        """Передать ход следующему игроку, который не сбросил карты"""
        result = await db.execute(
            select(Player).where(Player.session_id == session.id).order_by(Player.id)
        )
        players = result.scalars().all()
        folded = {p.id for p in players if p.folded}
        eligible = [p.id for p in players if p.id not in folded]
        if not eligible:
            round_obj.is_closed = 1
            await db.commit()
            await self._resolve_round(session, round_obj, db)
            return

        try:
            pos = eligible.index(actor_id)
        except ValueError:
            pos = -1
        round_obj.current_turn_player_id = eligible[(pos + 1) % len(eligible)]
        await db.commit()

    async def _advance_if_stalled(self, join_code: str, db: AsyncSession):
        """После сдачи/выхода: если ходить некому, закрыть и рассчитать раунд"""
        result = await db.execute(select(Session).where(Session.join_code == join_code))
        session = result.scalar_one_or_none()
        if not session or session.status != "playing":
            return
        round_obj = await self._current_round(session.id, db)
        if not round_obj or round_obj.status != "active" or round_obj.is_closed:
            return

        result = await db.execute(
            select(Player).where(Player.session_id == session.id).order_by(Player.id)
        )
        players = result.scalars().all()
        connected = set(self._connected_ids(join_code))
        waiting = [p for p in players if not p.folded and p.id in connected]
        if len(waiting) == 1:
            # Остальные сдались или ушли — последний оставшийся забирает банк
            round_obj.leader_player_id = waiting[0].id
            round_obj.is_closed = 1
            await db.commit()
            await self._resolve_round(session, round_obj, db)
            return
        if waiting:
            # Кто-то ещё может ходить — передаём ход первому из ожидающих,
            # если текущий ход числится за выбывшим
            if round_obj.current_turn_player_id not in {p.id for p in waiting}:
                round_obj.current_turn_player_id = waiting[0].id
                await db.commit()
            return

        round_obj.is_closed = 1
        await db.commit()
        await self._resolve_round(session, round_obj, db)

    async def _resolve_round(self, session: Session, round_obj: Round, db: AsyncSession):
        """Расчёт раунда.

        - Победитель по старшей карте забирает банк в score.
        - Последние карты равны по силе — переигровка, банк не распределяется.
        - Партия завершается, когда score обнуляется у всех, кроме одного.
        """
        result = await db.execute(
            select(Player).where(Player.session_id == session.id).order_by(Player.id)
        )
        players = result.scalars().all()
        for p in players:
            if p.score < 0:
                p.score = 0

        # Две последние сыгранные карты раунда
        result = await db.execute(
            select(RoundAction, Card)
            .join(PlayerCard, RoundAction.player_card_id == PlayerCard.id)
            .join(Card, PlayerCard.card_id == Card.id)
            .where(
                RoundAction.round_id == round_obj.id,
                RoundAction.action_type == "play",
            )
            .order_by(RoundAction.id.desc())
            .limit(2)
        )
        rows = result.all()

        # Финальная серия равных карт
        tied_ids: List[int] = []
        top_power: Optional[int] = None
        for act, card in rows:
            if top_power is None:
                top_power = card.power
                tied_ids = [act.player_id]
            elif card.power == top_power:
                tied_ids.append(act.player_id)
            else:
                break

        ante = session.ante

        if len(tied_ids) >= 2:
            # Переигровка: раунд закрыт, банк не распределяется, карты не раздаются
            round_obj.status = "finished"
            round_obj.finished_at = utcnow()
            round_obj.is_tiebreak = 1
            round_obj.current_power = None
            round_obj.leader_player_id = None
            connected = self._connected_ids(session.join_code)
            replayers = [pid for pid in reversed(tied_ids) if pid in connected]
            round_obj.current_turn_player_id = replayers[0] if replayers else tied_ids[0]
            await db.commit()
            await self._broadcast(
                session.join_code,
                {
                    "type": "tiebreak_required",
                    "round_number": round_obj.round_number,
                    "tied_player_ids": tied_ids,
                    "power": top_power,
                    "current_player_id": round_obj.current_turn_player_id,
                    "message": "Равные старшие карты — переигровка",
                },
            )
            return

        winner_id = round_obj.leader_player_id
        if winner_id is None and not any(p.folded for p in players):
            # Карт не осталось и старшей карты нет — минимальная сила побеждает
            result = await db.execute(
                select(RoundAction, Card)
                .join(PlayerCard, RoundAction.player_card_id == PlayerCard.id)
                .join(Card, PlayerCard.card_id == Card.id)
                .where(
                    RoundAction.round_id == round_obj.id,
                    RoundAction.action_type == "play",
                )
                .order_by(Card.power.asc())
                .limit(1)
            )
            row = result.first()
            if row:
                winner_id = row[0].player_id

        round_obj.status = "finished"
        round_obj.finished_at = utcnow()
        round_obj.current_turn_player_id = None
        round_obj.current_power = None
        round_obj.is_tiebreak = 0

        winner = None
        if winner_id is not None:
            result = await db.execute(select(Player).where(Player.id == winner_id))
            winner = result.scalar_one_or_none()
            if winner:
                winner.score += ante

        session.ante = 0
        session.games_played += 1
        # Партия сыграна — комната снова ждёт старта следующей
        session.status = "waiting"
        for p in players:
            p.folded = 0
            p.is_ready = 0
        await db.commit()

        await self._broadcast(
            session.join_code,
            {
                "type": "round_finished",
                "round_number": round_obj.round_number,
                "winner_player_id": winner_id,
                "winner_nickname": winner.nickname if winner else None,
                "bank_won": ante if winner else 0,
                "no_leader_rule": NO_LEADER_ORDER if winner_id is None else None,
            },
        )

        await self._maybe_finish_game(session, db)

    async def _maybe_finish_game(self, session: Session, db: AsyncSession):
        """Партия окончена, когда средства остались максимум у одного игрока"""
        result = await db.execute(
            select(Player).where(Player.session_id == session.id).order_by(Player.id)
        )
        players = result.scalars().all()
        if not players:
            return

        rich = [p for p in players if p.score > 0]
        if len(rich) > 1:
            return

        winner = max(rich, key=lambda p: p.score) if rich else None
        session.status = "finished"
        session.winner_nickname = winner.nickname if winner else None
        await db.commit()

        await self._broadcast(
            session.join_code,
            {
                "type": "game_finished",
                "winner_player_id": winner.id if winner else None,
                "winner_nickname": winner.nickname if winner else None,
                "scores": [
                    {"player_id": p.id, "nickname": p.nickname, "score": p.score}
                    for p in players
                ],
                "message": (
                    f"Партию выиграл {winner.nickname}"
                    if winner
                    else "Средств ни у кого не осталось"
                ),
            },
        )

    # ------------------------------------------------------------------
    # Рассылка и снапшот состояния
    # ------------------------------------------------------------------

    async def _broadcast_states(self, join_code: str, db: AsyncSession):
        """Отправить персональный снапшот каждому подключённому игроку"""
        for pid in list(self.rooms.get(join_code, {}).keys()):
            state = await self._build_state(join_code, pid, db)
            await self.send_to(pid, state)

    async def _broadcast(self, join_code: str, data: dict, exclude: Optional[int] = None):
        """Отправить всем в комнате, кроме exclude"""
        if join_code not in self.rooms:
            return
        room = self.rooms[join_code]
        tasks = []
        for pid, conn in room.items():
            if pid == exclude:
                continue
            try:
                tasks.append(conn.websocket.send_json(data))
            except Exception:
                logger.warning(f"Failed to send to player {pid}")
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _build_state(self, join_code: str, player_id: int, db: AsyncSession) -> dict:
        """Собрать полный снапшот состояния для игрока"""
        result = await db.execute(select(Session).where(Session.join_code == join_code))
        session = result.scalar_one_or_none()
        if not session:
            return {"type": "error", "message": "Session not found"}

        result = await db.execute(select(Player).where(Player.id == player_id))
        player = result.scalar_one_or_none()
        if not player:
            return {"type": "error", "message": "Player not found"}

        # Карты в руке (не сыгранные)
        result = await db.execute(
            select(PlayerCard, Card)
            .join(Card, PlayerCard.card_id == Card.id)
            .where(
                PlayerCard.player_id == player_id,
                PlayerCard.played_at.is_(None),
            )
            .order_by(PlayerCard.hand_order)
        )
        my_cards = [
            PlayerCardResponse(
                id=pc.id,
                card=CardResponse(
                    id=c.id, name=c.name, suit=c.suit, value=c.value, power=c.power
                ),
                hand_order=pc.hand_order,
            )
            for pc, c in result.all()
        ]

        result = await db.execute(
            select(Player)
            .where(Player.session_id == session.id)
            .order_by(Player.id)
        )
        players = result.scalars().all()

        round_obj = await self._current_round(session.id, db)

        # Карты на столе (последние сыгранные в раунде)
        table_cards: List[PlayerCardResponse] = []
        if round_obj:
            result = await db.execute(
                select(RoundAction, PlayerCard, Card)
                .join(PlayerCard, RoundAction.player_card_id == PlayerCard.id)
                .join(Card, PlayerCard.card_id == Card.id)
                .where(
                    RoundAction.round_id == round_obj.id,
                    RoundAction.action_type == "play",
                )
                .order_by(RoundAction.id.desc())
                .limit(TABLE_CARDS_LIMIT)
            )
            for act, pc, c in result.all():
                table_cards.append(
                    PlayerCardResponse(
                        id=pc.id,
                        card=CardResponse(
                            id=c.id,
                            name=c.name,
                            suit=c.suit,
                            value=c.value,
                            power=c.power,
                        ),
                        hand_order=pc.hand_order,
                        player_id=act.player_id,
                    )
                )

        connected = set(self._connected_ids(join_code))
        other_payload = []
        my_payload = None
        for p in players:
            payload = {
                "id": p.id,
                "nickname": p.nickname,
                "avatar": p.avatar,
                "score": p.score,
                "bet": p.bet,
                "is_ready": bool(p.is_ready),
                "folded": bool(p.folded),
                "connected": p.id in connected,
                "cards_left": await self._hand_size(p.id, db),
            }
            if p.id == player_id:
                my_payload = payload
            else:
                other_payload.append(payload)

        if my_payload is None:
            return {"type": "error", "message": "Player not found"}

        return {
            "type": "game_state",
            "session_id": session.id,
            "session_status": session.status,
            "join_code": session.join_code,
            "max_players": session.max_players,
            "round_number": round_obj.round_number if round_obj else 0,
            "current_player_id": round_obj.current_turn_player_id if round_obj else None,
            "leader_player_id": round_obj.leader_player_id if round_obj else None,
            "current_power": round_obj.current_power if round_obj else None,
            "is_tiebreak": bool(round_obj.is_tiebreak) if round_obj else False,
            "ante": session.ante,
            "games_played": session.games_played,
            "winner_nickname": session.winner_nickname,
            "player": my_payload,
            # pydantic-модели → dict, иначе websocket.send_json не сериализует снапшот
            "my_cards": [pc.model_dump(mode="json") for pc in my_cards],
            "other_players": other_payload,
            "table_cards": [pc.model_dump(mode="json") for pc in table_cards],
            "round_status": round_obj.status if round_obj else "pending",
            "timestamp": utcnow().isoformat(),
        }

    def get_room(self, join_code: str) -> Optional[Dict[int, RoomConnection]]:
        return self.rooms.get(join_code)

    def get_player_conn(self, player_id: int) -> Optional[RoomConnection]:
        return self._player_to_room.get(player_id)

    def reset_state(self):
        """Полная очистка состояния комнат (используется в тестах)"""
        self.rooms.clear()
        self._player_to_room.clear()
        self._processed_actions.clear()
