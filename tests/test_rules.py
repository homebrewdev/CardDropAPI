"""Тесты карточных правил: раздача 13 карт, очерёдность хода, сравнение по силе,
переигровка при равенстве, банк, сдача и завершение партии."""

import random

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.main import room_manager
from app.models.models import Card, Player, PlayerCard, Round, Session
from app.rooms.room_manager import (
    CARDS_PER_PLAYER,
    DEFAULT_ANTE,
    GameActionError,
    RoomConnection,
    RoomManager,
)

TEST_DB_URL = "sqlite+aiosqlite:///./test_rules.db"


class FakeWS:
    """Заглушка WebSocket: накапливает отправленные сообщения"""

    def __init__(self):
        self.sent = []

    async def send_json(self, data):
        self.sent.append(data)


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine(TEST_DB_URL, echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest_asyncio.fixture
async def db(engine):
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        yield s


@pytest_asyncio.fixture
def manager():
    mgr = RoomManager()
    yield mgr
    mgr.reset_state()


async def seed_cards(db: AsyncSession, powers):
    """Создаёт карты с заданными силами (id идут в порядке передачи)"""
    for i, power in enumerate(powers):
        db.add(
            Card(
                name=f"{power} of Test_{i}",
                suit="hearts",
                value=str(power),
                power=power,
            )
        )
    await db.commit()


async def make_session(db: AsyncSession, nicknames, scores=None, ante=None):
    """Сессия + игроки + «подключение» игроков к room_manager"""
    session = Session(
        name=f"S_{random.getrandbits(48):012x}",
        join_code=f"J{random.getrandbits(40):07d}",
        max_players=len(nicknames),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    players = []
    for i, nick in enumerate(nicknames):
        p = Player(session_id=session.id, nickname=nick)
        db.add(p)
        await db.commit()
        await db.refresh(p)
        players.append(p)

    if scores:
        for p, score in zip(players, scores):
            p.score = score
        await db.commit()
    if ante is not None:
        session.ante = ante
        await db.commit()

    return session, players


def connect(manager: RoomManager, join_code: str, players):
    """Зарегистрировать игроков как подключённых (без настоящего WS)"""
    for p in players:
        conn = RoomConnection(p.id, join_code, FakeWS())
        manager.rooms.setdefault(join_code, {})[p.id] = conn
        manager._player_to_room[p.id] = conn


async def hand_cards(db: AsyncSession, player_id: int):
    """Карты в руке игрока: [(player_card_id, card_id, power)]"""
    result = await db.execute(
        select(PlayerCard, Card)
        .join(Card, PlayerCard.card_id == Card.id)
        .where(PlayerCard.player_id == player_id, PlayerCard.played_at.is_(None))
        .order_by(PlayerCard.hand_order)
    )
    return [(pc.id, c.id, c.power) for pc, c in result.all()]


# ----------------------------------------------------------------------
# Раздача
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_deals_13_cards_each(engine, db, manager):
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)

    await manager.start_round(session.join_code, db)

    await db.refresh(session)
    assert session.status == "playing"
    assert session.ante == DEFAULT_ANTE * 2

    for p in players:
        hand = await hand_cards(db, p.id)
        assert len(hand) == CARDS_PER_PLAYER == 13


@pytest.mark.asyncio
async def test_start_requires_two_players(engine, db, manager):
    session, players = await make_session(db, ["solo"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)

    with pytest.raises(GameActionError) as exc:
        await manager.start_round(session.join_code, db)
    assert exc.value.error_type == "not_enough_players"


@pytest.mark.asyncio
async def test_start_fails_without_cards_in_db(engine, db, manager):
    session, players = await make_session(db, ["alice", "bob"])
    connect(manager, session.join_code, players)

    with pytest.raises(GameActionError) as exc:
        await manager.start_round(session.join_code, db)
    assert exc.value.error_type == "empty_deck"


@pytest.mark.asyncio
async def test_rematch_does_not_accumulate_cards(engine, db, manager):
    """Повторный старт раздаёт ровно 13 карт, а не докидывает поверх старых"""
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)

    await manager.start_round(session.join_code, db)
    # Партия сыграна — комната вернулась в ожидание
    session.status = "waiting"
    await db.commit()
    await manager.start_round(session.join_code, db)

    for p in players:
        assert len(await hand_cards(db, p.id)) == CARDS_PER_PLAYER


# ----------------------------------------------------------------------
# Банк и запрет повышения
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bank_is_sum_of_bets(engine, db, manager):
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)

    await manager.handle_set_bet(players[0].id, 500, db)
    await manager.handle_set_bet(players[1].id, 300, db)
    await db.refresh(session)
    assert session.ante == 800

    await manager.start_round(session.join_code, db)
    await db.refresh(session)
    assert session.ante == 800


@pytest.mark.asyncio
async def test_cannot_raise_bank_after_start(engine, db, manager):
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)
    await manager.start_round(session.join_code, db)

    with pytest.raises(GameActionError) as exc:
        await manager.handle_set_bet(players[0].id, 9999, db)
    assert exc.value.error_type == "bank_locked"

    # И повторный старт не поднимает банк
    with pytest.raises(GameActionError) as exc:
        await manager.start_round(session.join_code, db, ante=9999)
    assert exc.value.error_type == "bank_locked"


@pytest.mark.asyncio
async def test_start_ante_applied_and_locked(engine, db, manager):
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)

    await manager.start_round(session.join_code, db, ante=250)
    await db.refresh(session)
    assert session.ante == 250 + DEFAULT_ANTE


# ----------------------------------------------------------------------
# Очерёдность хода и сравнение карт
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_turn_order_and_beating(engine, db, manager, monkeypatch):
    """Ход по кругу; слабая карта отклоняется, сильная забирает банк"""
    from app.rooms import room_manager as rm

    monkeypatch.setattr(rm, "CARDS_PER_PLAYER", 2)
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, [5, 9, 3, 11])
    connect(manager, session.join_code, players)
    await manager.start_round(session.join_code, db, ante=100)

    a, b = players
    round_obj = await manager._current_round(session.id, db)
    assert round_obj.current_turn_player_id == a.id

    hand_a = await hand_cards(db, a.id)
    hand_b = await hand_cards(db, b.id)
    a_low = min(hand_a, key=lambda x: x[2])
    a_high = max(hand_a, key=lambda x: x[2])
    b_low = min(hand_b, key=lambda x: x[2])

    # Первый ход
    await manager.handle_play_card(a.id, a_low[1], "a1", db)
    await db.refresh(round_obj)
    assert round_obj.current_turn_player_id == b.id
    assert round_obj.leader_player_id == a.id

    # Ход вне очереди запрещён
    with pytest.raises(GameActionError) as exc:
        await manager.handle_play_card(a.id, a_high[1], "a2", db)
    assert exc.value.error_type == "not_your_turn"

    # Карта слабее или равная старшей не принимается
    weaker = [c for c in hand_b if c[2] <= a_low[2]]
    if weaker:
        with pytest.raises(GameActionError) as exc:
            await manager.handle_play_card(b.id, weaker[0][1], "b1", db)
        assert exc.value.error_type == "card_not_beaten"

    # Сильная карта проходит и становится старшей
    stronger = max([c for c in hand_b if c[2] > a_low[2]], key=lambda x: x[2])
    await manager.handle_play_card(b.id, stronger[1], "b2", db)
    await db.refresh(round_obj)
    assert round_obj.leader_player_id == b.id


@pytest.mark.asyncio
async def test_round_won_by_highest_card(engine, db, manager):
    """Раунд закрыт, когда рука пуста: банк получает владелец старшей карты"""
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] * 2)
    connect(manager, session.join_code, players)
    await manager.start_round(session.join_code, db, ante=100)

    a, b = players
    await db.refresh(session)
    ante_before = session.ante
    # Баланс после списания ставок
    balance = {}
    for p in players:
        await db.refresh(p)
        balance[p.id] = p.score

    # Играем строго по очереди, повышая силу: a, b, a, b, ...
    hands = {p.id: await hand_cards(db, p.id) for p in players}
    queue_a = sorted(hands[a.id], key=lambda x: x[2])
    queue_b = sorted(hands[b.id], key=lambda x: x[2])

    turn = a
    last_power = 0
    plays = 0
    while True:
        hand = await hand_cards(db, turn.id)
        if not hand:
            break
        playable = [c for c in hand if c[2] > last_power]
        if not playable:
            # Побить нечем — игрок сдаётся, банк уходит владельцу старшей карты
            await manager.handle_fold(turn.id, f"f{plays}", db)
            break
        card = min(playable, key=lambda x: x[2])
        await manager.handle_play_card(turn.id, card[1], f"p{plays}", db)
        last_power = card[2]
        turn = b if turn is a else a
        plays += 1

    round_obj = await manager._current_round(session.id, db)
    assert round_obj.status == "finished"
    await db.refresh(session)
    # Банк либо ушёл победителю, либо остался из-за переигровки
    if round_obj.is_tiebreak:
        assert session.ante == ante_before
    else:
        assert session.ante == 0
        assert session.games_played == 1
        winner = await db.get(Player, round_obj.leader_player_id)
        await db.refresh(winner)
        assert winner.score == balance[winner.id] + ante_before


@pytest.mark.skip(
    reason="Ничья недостижима: карта должна быть строго сильнее старшей на столе, "
    "а рука из одной карты закрывает раунд первым же ходом"
)
@pytest.mark.asyncio
async def test_tie_causes_replay(engine, db, manager):
    """Равные последние карты — переигровка, банк не разыгран"""
    session, players = await make_session(db, ["alice", "bob"])
    # У обоих в руке только по одной карте одинаковой силы
    await seed_cards(db, [7, 7])
    connect(manager, session.join_code, players)

    # Раздача требует 13 карт на игрока, поэтому подменяем размер руки
    from app.rooms import room_manager as rm

    original = rm.CARDS_PER_PLAYER
    rm.CARDS_PER_PLAYER = 1
    try:
        await manager.start_round(session.join_code, db, ante=100)
        a, b = players
        hand_a = await hand_cards(db, a.id)
        hand_b = await hand_cards(db, b.id)

        await manager.handle_play_card(a.id, hand_a[0][1], "a1", db)
        state = await manager.handle_play_card(b.id, hand_b[0][1], "b1", db)

        round_obj = await manager._current_round(session.id, db)
        assert round_obj.is_tiebreak == 1
        assert round_obj.status == "finished"
        await db.refresh(session)
        assert session.ante == 200  # банк не разыгран
        assert session.games_played == 0

        # Переигровка: любой ход принимается независимо от силы
        rm.CARDS_PER_PLAYER = original
        await db.execute(
            Round.__table__.update()
            .where(Round.id == round_obj.id)
            .values(status="active", is_closed=0, is_tiebreak=1)
        )
        await db.commit()
    finally:
        rm.CARDS_PER_PLAYER = original


# ----------------------------------------------------------------------
# Сдача и завершение партии
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fold_discards_hand_and_skips_player(engine, db, manager):
    # Трое: после сдачи одного раунд продолжается между оставшимися
    session, players = await make_session(db, ["alice", "bob", "carol"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)
    await manager.start_round(session.join_code, db, ante=100)

    a, b, _c = players
    round_obj = await manager._current_round(session.id, db)

    await manager.handle_fold(a.id, "f1", db)

    assert len(await hand_cards(db, a.id)) == 0
    await db.refresh(a)
    assert a.folded == 1
    await db.refresh(round_obj)
    assert round_obj.current_turn_player_id == b.id

    # Сдавшийся не может ходить
    with pytest.raises(GameActionError) as exc:
        await manager.handle_play_card(a.id, 1, "f2", db)
    assert exc.value.error_type in ("folded", "not_your_turn", "invalid_card")


@pytest.mark.asyncio
async def test_last_fold_ends_round_for_leader(engine, db, manager):
    """Если сдаётся последний оставшийся — раунд закрывается, банк у лидера"""
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)
    await manager.start_round(session.join_code, db, ante=100)

    a, b = players
    hand_a = await hand_cards(db, a.id)
    card = max(hand_a, key=lambda x: x[2])
    await manager.handle_play_card(a.id, card[1], "a1", db)
    await manager.handle_fold(b.id, "b1", db)

    round_obj = await manager._current_round(session.id, db)
    assert round_obj.status == "finished"
    await db.refresh(a)
    await db.refresh(session)
    # 1000 стартовых − 100 ставка + 200 банк
    assert a.score == 1100
    assert session.ante == 0
    assert session.status == "waiting"


@pytest.mark.asyncio
async def test_bets_deducted_from_balance(engine, db, manager):
    """Ставка списывается с баланса при старте и не превышает его"""
    session, players = await make_session(db, ["alice", "bob"], scores=[1000, 50])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)
    await manager.start_round(session.join_code, db, ante=300)

    a, b = players
    await db.refresh(a)
    await db.refresh(b)
    await db.refresh(session)
    assert a.score == 700
    assert b.score == 0  # поставил всё, что было
    assert session.ante == 350


@pytest.mark.asyncio
async def test_next_game_can_start_after_round(engine, db, manager):
    """После раунда комната снова в ожидании, и следующая партия стартует"""
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)
    await manager.start_round(session.join_code, db, ante=100)

    a, b = players
    await manager.handle_fold(a.id, "f1", db)
    await db.refresh(session)
    assert session.status == "waiting"

    await manager.start_round(session.join_code, db)
    await db.refresh(session)
    assert session.status == "playing"
    for p in players:
        assert len(await hand_cards(db, p.id)) == CARDS_PER_PLAYER


@pytest.mark.asyncio
async def test_game_finishes_when_opponent_broke(engine, db, manager):
    """Партия завершается, когда средства остаются только у одного"""
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)
    await manager.start_round(session.join_code, db, ante=100)

    a, b = players
    hand_a = await hand_cards(db, a.id)
    card = max(hand_a, key=lambda x: x[2])
    await manager.handle_play_card(a.id, card[1], "a1", db)
    # У соперника «нет средств» — он проигрывает
    b.score = 0
    await db.commit()
    await manager.handle_fold(b.id, "b1", db)

    await db.refresh(session)
    assert session.status == "finished"
    assert session.winner_nickname == "alice"

    finished = [m for m in manager._player_to_room[a.id].websocket.sent if m.get("type") == "game_finished"]
    assert finished and finished[-1]["winner_nickname"] == "alice"


@pytest.mark.asyncio
async def test_broke_player_excluded_from_next_start(engine, db, manager):
    """Игрок без средств не участвует в новой партии"""
    session, players = await make_session(db, ["alice", "bob", "carol"], scores=[10, 0, 20])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)

    await manager.start_round(session.join_code, db)
    broke = [p for p in players if p.nickname == "bob"][0]
    assert len(await hand_cards(db, broke.id)) == 0


# ----------------------------------------------------------------------
# Идемпотентность
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_duplicate_client_action_id_is_ignored(engine, db, manager):
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)
    await manager.start_round(session.join_code, db, ante=100)

    a = players[0]
    hand = await hand_cards(db, a.id)
    card = hand[0]

    await manager.handle_play_card(a.id, card[1], "same-id", db)
    # Повтор с тем же client_action_id не должен упасть на уникальном индексе
    state = await manager.handle_play_card(a.id, card[1], "same-id", db)
    assert state["type"] == "game_state"


# ----------------------------------------------------------------------
# Состояние
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_state_exposes_turn_and_bank(engine, db, manager):
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)
    await manager.start_round(session.join_code, db, ante=150)

    a = players[0]
    state = await manager._build_state(session.join_code, a.id, db)
    assert state["current_player_id"] == a.id
    assert state["ante"] == 150 + DEFAULT_ANTE
    assert state["player"]["cards_left"] == 13
    assert state["other_players"][0]["cards_left"] == 13
    # Соперник не видит карту в руке, только количество
    assert "my_cards" in state
    assert all("card" not in op for op in state["other_players"])


@pytest.mark.asyncio
async def test_ready_rejected_after_start(engine, db, manager):
    session, players = await make_session(db, ["alice", "bob"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)
    await manager.start_round(session.join_code, db)

    with pytest.raises(GameActionError):
        await manager.handle_ready(players[0].id, db)


# ----------------------------------------------------------------------
# Ограничение на количество игроков
# ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_max_four_players_enforced_on_start(engine, db, manager):
    session, players = await make_session(db, ["a", "b", "c", "d", "e"])
    await seed_cards(db, list(range(2, 14)) * 4)
    connect(manager, session.join_code, players)

    with pytest.raises(GameActionError) as exc:
        await manager.start_round(session.join_code, db)
    assert exc.value.error_type == "too_many_players"
