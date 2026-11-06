import string
import random
from typing import List
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.models import Session, Player
from app.schemas.schemas import SessionCreate, SessionResponse, PlayerResponse

router = APIRouter(prefix="/api", tags=["rest"])


def generate_join_code(length=8) -> str:
    """Генерирует уникальный код для входа в комнату"""
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))


@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(
    session_data: SessionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Создать новую игровую сессию"""
    # Проверяем уникальность имени
    result = await db.execute(
        select(Session).where(Session.name == session_data.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Session name already exists")

    # Генерируем join_code
    join_code = generate_join_code()
    # Проверяем уникальность
    while True:
        result = await db.execute(
            select(Session).where(Session.join_code == join_code)
        )
        if not result.scalar_one_or_none():
            break
        join_code = generate_join_code()

    session = Session(
        name=session_data.name,
        join_code=join_code,
        max_players=session_data.max_players,
        deck_type=session_data.deck_type,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return SessionResponse(
        id=session.id,
        name=session.name,
        join_code=session.join_code,
        status=session.status,
        max_players=session.max_players,
        current_players=0,
        deck_type=session.deck_type,
        created_at=session.created_at,
        players=[],
    )


@router.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
):
    """Получить список всех сессий"""
    result = await db.execute(
        select(Session).order_by(Session.created_at.desc())
    )
    sessions = result.scalars().all()

    return [
        SessionResponse(
            id=s.id,
            name=s.name,
            join_code=s.join_code,
            status=s.status,
            max_players=s.max_players,
            current_players=len(s.players),
            deck_type=s.deck_type,
            created_at=s.created_at,
            players=[
                PlayerResponse(
                    id=p.id,
                    nickname=p.nickname,
                    avatar=p.avatar,
                    score=p.score,
                    is_ready=bool(p.is_ready),
                )
                for p in s.players
            ],
        )
        for s in sessions
    ]


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Получить информацию о сессии"""
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(
            # TODO: добавить eager loading для players
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionResponse(
        id=session.id,
        name=session.name,
        join_code=session.join_code,
        status=session.status,
        max_players=session.max_players,
        current_players=len(session.players),
        deck_type=session.deck_type,
        created_at=session.created_at,
        players=[
            PlayerResponse(
                id=p.id,
                nickname=p.nickname,
                avatar=p.avatar,
                score=p.score,
                is_ready=bool(p.is_ready),
            )
            for p in session.players
        ],
    )
