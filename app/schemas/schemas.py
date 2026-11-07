from datetime import datetime
from typing import Optional, List
from uuid import uuid4

from pydantic import BaseModel, Field, ConfigDict


# ==================== Session ====================

class SessionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    max_players: int = Field(default=4, ge=2, le=4)
    deck_type: str = "standard"


class SessionResponse(BaseModel):
    id: int
    name: str
    join_code: str
    status: str
    max_players: int
    current_players: int = 0
    deck_type: str
    ante: int = 0
    games_played: int = 0
    winner_nickname: Optional[str] = None
    created_at: datetime
    players: List["PlayerResponse"] = []

    model_config = ConfigDict(from_attributes=True)


# ==================== Player ====================

class PlayerResponse(BaseModel):
    id: int
    nickname: str
    avatar: Optional[str] = None
    score: int
    bet: int = 0
    is_ready: bool
    folded: bool = False
    connected: bool = False
    cards_left: int = 0

    model_config = ConfigDict(from_attributes=True)


# ==================== Card ====================

class CardResponse(BaseModel):
    id: int
    name: str
    suit: Optional[str] = None
    value: str
    power: int

    model_config = ConfigDict(from_attributes=True)


class HiddenCardResponse(BaseModel):
    """Скрытая карта (чужая рука)"""
    id: Optional[int] = None
    face_down: bool = True

    model_config = ConfigDict(from_attributes=True)


# ==================== Player Card ====================

class PlayerCardResponse(BaseModel):
    id: int
    card: CardResponse
    hand_order: Optional[int] = None
    player_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class RoundResponse(BaseModel):
    id: int
    round_number: int
    dealer_id: Optional[int] = None
    current_turn_player_id: Optional[int] = None
    leader_player_id: Optional[int] = None
    current_power: Optional[int] = None
    is_tiebreak: bool = False
    status: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    actions: List["RoundActionResponse"] = []

    model_config = ConfigDict(from_attributes=True)


# ==================== Round ====================

class RoundResponse(BaseModel):
    id: int
    round_number: int
    dealer_id: Optional[int] = None
    status: str
    started_at: datetime
    finished_at: Optional[datetime] = None
    actions: List["RoundActionResponse"] = []

    model_config = ConfigDict(from_attributes=True)


class RoundActionResponse(BaseModel):
    id: int
    player_id: int
    player_card_id: Optional[int] = None
    action_type: str
    played_at: datetime
    metadata: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)


# ==================== Game State (WS payload) ====================

class GameStatePayload(BaseModel):
    """Полный снапшот состояния для WS"""
    session_id: int
    session_status: str
    round_number: int
    current_player_id: Optional[int] = None
    leader_player_id: Optional[int] = None
    current_power: Optional[int] = None
    is_tiebreak: bool = False
    ante: int = 0
    games_played: int = 0
    winner_nickname: Optional[str] = None
    player: PlayerResponse
    my_cards: List[PlayerCardResponse]
    other_players: List[PlayerResponse]
    table_cards: List[PlayerCardResponse] = []
    round_status: str = "pending"
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class WSJoin(BaseModel):
    """Клиент подключается к комнате"""
    join_code: str
    nickname: str = Field(..., min_length=1, max_length=30)


class WSReady(BaseModel):
    """Клиент нажимает 'готов'"""
    action: str = "ready"
    player_id: int


class WSStart(BaseModel):
    """Клиент начинает партию. ante — ставка, которую он вносит в банк"""
    action: str = "start"
    ante: Optional[int] = Field(default=None, ge=1, le=10000)


class WSSetBet(BaseModel):
    """Клиент меняет свою ставку до старта партии"""
    action: str = "set_bet"
    bet: int = Field(..., ge=1, le=10000)


class WSPlayCard(BaseModel):
    """Клиент играет карту"""
    action: str = "play_card"
    player_id: int
    card_id: int
    client_action_id: str = Field(default_factory=lambda: str(uuid4()))


class WSPass(BaseModel):
    """Клиент сбрасывает карты (сдаётся)"""
    action: str = "pass"
    player_id: int
    client_action_id: str = Field(default_factory=lambda: str(uuid4()))


class WSFold(BaseModel):
    """Клиент сбрасывает карты (сдаётся) — явное имя действия"""
    action: str = "fold"
    player_id: int
    client_action_id: str = Field(default_factory=lambda: str(uuid4()))


class WSDisconnect(BaseModel):
    """Клиент отключается"""
    action: str = "disconnect"
    player_id: int
    join_code: str
