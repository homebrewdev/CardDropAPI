"""Фикстуры для тестов"""

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.config import get_settings

settings = get_settings()

# Создаём отдельную тестовую БД
TEST_DB_URL = "sqlite+aiosqlite:///./test_cardgame.db"


@pytest_asyncio.fixture
async def test_engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db(test_engine):
    session = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session() as s:
        yield s
        await s.rollback()


@pytest_asyncio.fixture
async def session_factory(test_engine):
    """Возвращает factory для создания сессий в тестах"""
    return sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
