from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    JSON,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    # Название не уникально: идентификатором комнаты является join_code
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    join_code: Mapped[str] = mapped_column(String(8), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(
        Enum("waiting", "playing", "finished", "cancelled", name="session_status"),
        nullable=False,
        default="waiting",
    )
    max_players: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=4)
    # Денормализованный счётчик подключённых игроков: поддерживает room_manager
    current_players: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    deck_type: Mapped[str] = mapped_column(String(50), nullable=False, default="standard")
    # Банк: сумма ставок (анте), внесённых игроками. Повышать банк нельзя,
    # поэтому после старта партии ante фиксируется до окончания раунда.
    ante: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Число сыгранных партий и победитель партии (никнейм), если она завершена
    games_played: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    winner_nickname: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    players: Mapped[List["Player"]] = relationship(
        "Player", back_populates="session", cascade="all, delete-orphan", lazy="selectin"
    )
    rounds: Mapped[List["Round"]] = relationship(
        "Round", back_populates="session", cascade="all, delete-orphan", order_by="Round.round_number"
    )


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    nickname: Mapped[str] = mapped_column(String(30), nullable=False)
    avatar: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Ставка игрока в текущей партии (анте). Меняется только до старта партии:
    # повышение банка после начала игры запрещено правилами.
    bet: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # 1 = игрок сбросил карты (сдался) в текущем раунде
    folded: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    is_ready: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    session: Mapped["Session"] = relationship("Session", back_populates="players")
    cards: Mapped[List["PlayerCard"]] = relationship(
        "PlayerCard", back_populates="player", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (UniqueConstraint("session_id", "nickname", name="uk_players_session_nickname"),)


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    suit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    value: Mapped[str] = mapped_column(String(10), nullable=False)
    power: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    image_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    deck_entries: Mapped[List["Deck"]] = relationship("Deck", back_populates="card")


class Deck(Base):
    __tablename__ = "decks"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(
        Enum("main", "discard", "draw", name="deck_type"), nullable=False, default="main"
    )
    card_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("cards.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    card: Mapped["Card"] = relationship("Card", back_populates="deck_entries")


class PlayerCard(Base):
    __tablename__ = "player_cards"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    player_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("players.id", ondelete="CASCADE"),
        nullable=False,
    )
    deck_id: Mapped[Optional[int]] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("decks.id", ondelete="SET NULL"),
        nullable=True,
    )
    card_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("cards.id", ondelete="CASCADE"),
        nullable=False,
    )
    hand_order: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)
    played_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    player: Mapped["Player"] = relationship("Player", back_populates="cards")
    card: Mapped["Card"] = relationship("Card")


class Round(Base):
    __tablename__ = "rounds"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    dealer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("players.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Игрок, который обязан сделать ход сейчас
    current_turn_player_id: Mapped[Optional[int]] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("players.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Игрок, чья карта на столе сейчас старшая (владелец взятки)
    leader_player_id: Mapped[Optional[int]] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("players.id", ondelete="SET NULL"),
        nullable=True,
    )
    # Сила старшей карты на столе; None = на столе нет открытых карт
    current_power: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Раунд остановлен серией равных карт и требует переигровки
    is_tiebreak: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    # Раунд закрыт, но ещё не рассчитан (нужна переигровка)
    is_closed: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(
        Enum("pending", "active", "finished", name="round_status"),
        nullable=False,
        default="pending",
    )

    session: Mapped["Session"] = relationship("Session", back_populates="rounds")
    actions: Mapped[List["RoundAction"]] = relationship(
        "RoundAction", back_populates="round", cascade="all, delete-orphan", order_by="RoundAction.id"
    )


class RoundAction(Base):
    __tablename__ = "round_actions"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    round_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("rounds.id", ondelete="CASCADE"),
        nullable=False,
    )
    player_id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("players.id", ondelete="CASCADE"),
        nullable=False,
    )
    player_card_id: Mapped[Optional[int]] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"),
        ForeignKey("player_cards.id", ondelete="SET NULL"),
        nullable=True,
    )
    action_type: Mapped[str] = mapped_column(
        Enum("play", "pass", "draw", "discard", name="action_type"), nullable=False
    )
    client_action_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    played_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column("metadata", JSON, nullable=True)

    round: Mapped["Round"] = relationship("Round", back_populates="actions")

    __table_args__ = (
        UniqueConstraint(
            "round_id", "player_id", "client_action_id", name="uk_round_action_idempotent"
        ),
    )
