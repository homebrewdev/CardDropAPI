"""Колода игровой сессии.

Колода хранится в таблице decks: одна строка — одна карта сессии с позицией.
Порядок позиций определяет, какие карты уйдут игрокам при раздаче.
"""

import random
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Card, Deck


async def build_session_deck(
    session_id: int,
    db: AsyncSession,
    rng: Optional[random.Random] = None,
) -> List[Deck]:
    """Собрать и перетасовать колоду сессии из справочника карт.

    Возвращает строки Deck в порядке выдачи (по position).
    Если справочник пуст, возвращает пустой список.
    """
    result = await db.execute(select(Card).order_by(Card.id))
    cards = list(result.scalars().all())
    if not cards:
        return []

    (rng or random.Random()).shuffle(cards)
    rows = [
        Deck(
            session_id=session_id,
            type="main",
            card_id=card.id,
            position=position,
        )
        for position, card in enumerate(cards, start=1)
    ]
    db.add_all(rows)
    await db.flush()
    return rows
