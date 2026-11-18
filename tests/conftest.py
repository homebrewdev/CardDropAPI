"""Фикстуры для тестов"""

import asyncio
import os

# Приложение в тестах работает с отдельной базой, а не с рабочей cardgame.db.
# Переменная должна быть задана до первого импорта app.*: настройки кешируются.
TEST_APP_DB = "./test_app.db"
os.environ["SQLITE_PATH"] = TEST_APP_DB
if os.path.exists(TEST_APP_DB):
    os.remove(TEST_APP_DB)

import pytest_asyncio  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base  # noqa: E402
from app.config import get_settings  # noqa: E402

settings = get_settings()
assert settings.database_url.endswith("test_app.db"), settings.database_url


def _init_test_app_db():
    """Таблицы и справочник карт в тестовой базе приложения.
    ASGI-клиент в тестах не запускает lifespan, поэтому делаем это сами."""
    from app.db import engine, init_db

    async def run():
        await init_db()
        await engine.dispose()  # соединения привязаны к этому event loop

    asyncio.run(run())


_init_test_app_db()

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
