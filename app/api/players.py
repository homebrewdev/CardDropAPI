"""REST: аватарки игроков"""
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.avatars import AvatarError, parse_avatar
from app.db import get_db
from app.models.models import Player

router = APIRouter(prefix="/api", tags=["rest"])


@router.get("/players/{player_id}/avatar")
async def get_avatar(player_id: int, db: AsyncSession = Depends(get_db)):
    """Картинка аватарки. Ссылка в снапшотах содержит ?v=<версия>, поэтому
    ответ можно кешировать надолго: новая картинка — новая ссылка."""
    result = await db.execute(select(Player.avatar).where(Player.id == player_id))
    avatar = result.scalar_one_or_none()
    if not avatar:
        raise HTTPException(status_code=404, detail="Аватарки нет")
    try:
        mime, raw = parse_avatar(avatar)
    except AvatarError:
        raise HTTPException(status_code=404, detail="Аватарка повреждена")
    return Response(
        content=raw,
        media_type=mime,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
