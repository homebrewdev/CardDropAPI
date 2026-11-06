import asyncio
import logging
from datetime import datetime
from typing import Optional, Dict

from fastapi import WebSocket
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Session, Player, Card, PlayerCard, Round, RoundAction
from app.schemas.schemas import (
    GameStatePayload,
    PlayerResponse,
    PlayerCardResponse,
    CardResponse,
)

logger = logging.getLogger(__name__)


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
        self._lock = asyncio.Lock()

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

            # Обновить current_players
            await db.execute(
                update(Session)
                .where(Session.id == player.session_id)
                .values(current_players=len(self.rooms[join_code]))
            )
            await db.commit()

            # Рассказать другим о новом игроке
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

            # Отправить состояние новому игроку
            state = await self._build_state(join_code, player.id, db)
            await websocket.send_json(state)

            return conn

    async def leave(self, player_id: int, db: AsyncSession):
        """Игрок покидает комнату"""
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

            # Обновить current_players
            await db.execute(
                update(Session)
                .where(Session.join_code == join_code)
                .values(current_players=len(self.rooms.get(join_code, {})))
            )
            await db.commit()

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
                return False
        return False

    async def handle_play_card(
        self,
        player_id: int,
        card_id: int,
        client_action_id: str,
        db: AsyncSession,
    ) -> Optional[dict]:
        """Обработка хода карты"""
        # Загрузить игрока
        result = await db.execute(
            select(Player).where(Player.id == player_id)
        )
        player = result.scalar_one_or_none()
        if not player:
            return None

        # Найти карту в руке
        result = await db.execute(
            select(PlayerCard).where(
                PlayerCard.player_id == player_id,
                PlayerCard.card_id == card_id,
                PlayerCard.played_at.is_(None),
            )
        )
        pc = result.scalar_one_or_none()
        if not pc:
            return None

        # Пометить карту как сыгранную
        pc.played_at = datetime.utcnow()

        # Найти текущий раунд
        result = await db.execute(
            select(Round)
            .where(Round.session_id == player.session_id)
            .order_by(Round.round_number.desc())
            .limit(1)
        )
        round_obj = result.scalar_one_or_none()

        # Записать действие
        if round_obj:
            action = RoundAction(
                round_id=round_obj.id,
                player_id=player_id,
                player_card_id=pc.id,
                action_type="play",
                client_action_id=client_action_id,
            )
            db.add(action)

        await db.commit()

        # Собрать новое состояние и разослать
        session_result = await db.execute(
            select(Session).where(Session.id == player.session_id)
        )
        session = session_result.scalar_one_or_none()
        if not session:
            return None

        state = await self._build_state(session.join_code, player_id, db)
        await self._broadcast(session.join_code, state)
        return state

    async def handle_ready(self, player_id: int, db: AsyncSession) -> dict:
        """Обработка нажатия 'готов'"""
        await db.execute(
            update(Player).where(Player.id == player_id).values(is_ready=1)
        )
        await db.commit()
        return {"type": "player_ready", "player_id": player_id, "is_ready": True}

    async def handle_pass(
        self, player_id: int, client_action_id: str, db: AsyncSession
    ) -> Optional[dict]:
        """Обработка паса"""
        result = await db.execute(select(Player).where(Player.id == player_id))
        player = result.scalar_one_or_none()
        if not player:
            return None

        result = await db.execute(
            select(Session).where(Session.id == player.session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            return None

        result = await db.execute(
            select(Round)
            .where(Round.session_id == session.id)
            .order_by(Round.round_number.desc())
            .limit(1)
        )
        round_obj = result.scalar_one_or_none()

        if round_obj:
            action = RoundAction(
                round_id=round_obj.id,
                player_id=player_id,
                action_type="pass",
                client_action_id=client_action_id,
            )
            db.add(action)
            await db.commit()

        state = await self._build_state(session.join_code, player_id, db)
        await self._broadcast(session.join_code, state)
        return state

    async def start_round(
        self, join_code: str, db: AsyncSession
    ) -> Optional[dict]:
        """Начать новый раунд: раздать карты, создать Round"""
        result = await db.execute(
            select(Session).where(Session.join_code == join_code)
        )
        session = result.scalar_one_or_none()
        if not session:
            return None

        # Определить номер раунда
        result = await db.execute(
            select(Round)
            .where(Round.session_id == session.id)
            .order_by(Round.round_number.desc())
            .limit(1)
        )
        last_round = result.scalar_one_or_none()
        next_number = (last_round.round_number + 1) if last_round else 1

        # Создать раунд
        new_round = Round(
            session_id=session.id,
            round_number=next_number,
            status="active",
            started_at=datetime.utcnow(),
        )
        db.add(new_round)
        await db.commit()
        await db.refresh(new_round)

        # Раздать карты: 5 каждому
        result = await db.execute(
            select(Player).where(Player.session_id == session.id)
        )
        players = result.scalars().all()

        result = await db.execute(
            select(Card).order_by(Card.id)
        )
        cards = result.scalars().all()

        # Перемешать
        import random
        random.shuffle(cards)

        cards_per_player = 5
        card_idx = 0
        for player in players:
            for order in range(cards_per_player):
                if card_idx >= len(cards):
                    break
                card = cards[card_idx]
                pc = PlayerCard(
                    player_id=player.id,
                    card_id=card.id,
                    hand_order=order,
                )
                db.add(pc)
                card_idx += 1

        # Обновить статус сессии
        session.status = "playing"
        await db.commit()

        # Отправить состояние всем игрокам
        for player in players:
            state = await self._build_state(join_code, player.id, db)
            await self.send_to(player.id, state)

        # Уведомить о начале раунда
        await self._broadcast(
            join_code,
            {
                "type": "round_started",
                "round_number": next_number,
                "cards_per_player": cards_per_player,
            },
        )

        return {
            "type": "round_started",
            "round_number": next_number,
            "cards_per_player": cards_per_player,
        }

    async def _broadcast(
        self, join_code: str, data: dict, exclude: Optional[int] = None
    ):
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

    async def _build_state(
        self, join_code: str, player_id: int, db: AsyncSession
    ) -> dict:
        """Собрать полный снапшот состояния для игрока"""
        # Сессия
        result = await db.execute(
            select(Session).where(Session.join_code == join_code)
        )
        session = result.scalar_one_or_none()
        if not session:
            return {"type": "error", "message": "Session not found"}

        # Игрок
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
        rows = result.all()
        my_cards = [
            PlayerCardResponse(
                id=pc.id,
                card=CardResponse(
                    id=c.id, name=c.name, suit=c.suit, value=c.value, power=c.power
                ),
                hand_order=pc.hand_order,
            )
            for pc, c in rows
        ]

        # Другие игроки
        result = await db.execute(
            select(Player).where(
                Player.session_id == session.id, Player.id != player_id
            )
        )
        other_players = result.scalars().all()

        # Карты на столе (последние действия раунда)
        table_cards: List[PlayerCardResponse] = []
        result = await db.execute(
            select(Round)
            .where(Round.session_id == session.id)
            .order_by(Round.round_number.desc())
            .limit(1)
        )
        round_obj = result.scalar_one_or_none()

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
                .limit(4)
            )
            for act, pc, c in result.all():
                table_cards.append(
                    PlayerCardResponse(
                        id=pc.id,
                        card=CardResponse(
                            id=c.id, name=c.name, suit=c.suit, value=c.value, power=c.power
                        ),
                        hand_order=pc.hand_order,
                    )
                )

        return {
            "type": "game_state",
            "session_id": session.id,
            "session_status": session.status,
            "round_number": round_obj.round_number if round_obj else 0,
            "current_player_id": round_obj.dealer_id if round_obj else None,
            "player": {
                "id": player.id,
                "nickname": player.nickname,
                "avatar": player.avatar,
                "score": player.score,
                "is_ready": bool(player.is_ready),
            },
            "my_cards": my_cards,
            "other_players": [
                {
                    "id": p.id,
                    "nickname": p.nickname,
                    "avatar": p.avatar,
                    "score": p.score,
                    "is_ready": bool(p.is_ready),
                }
                for p in other_players
            ],
            "table_cards": table_cards,
            "round_status": round_obj.status if round_obj else "pending",
            "timestamp": datetime.utcnow().isoformat(),
        }

    def get_room(self, join_code: str) -> Optional[Dict[int, RoomConnection]]:
        return self.rooms.get(join_code)

    def get_player_conn(self, player_id: int) -> Optional[RoomConnection]:
        return self._player_to_room.get(player_id)
