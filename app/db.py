import logging

from sqlalchemy import JSON, Numeric, String, inspect, text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

_connect_args = {}
_engine_kwargs = {"echo": False, "pool_pre_ping": True}

if settings.DB_DIALECT == "sqlite":
    # SQLite требует check_same_thread=False для async
    _connect_args = {"check_same_thread": False}
else:
    _engine_kwargs.update({"pool_size": 10, "max_overflow": 20})

engine = create_async_engine(
    settings.database_url,
    connect_args=_connect_args,
    **_engine_kwargs,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session


async def init_db():
    """Создаёт таблицы при старте приложения"""
    from app.models import models  # noqa: F401  — регистрирует таблицы в Base.metadata

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if settings.DB_DIALECT == "sqlite":
            await conn.run_sync(_add_missing_columns)
    await seed_cards()


SUITS = {
    "hearts": "червей",
    "diamonds": "бубей",
    "clubs": "треф",
    "spades": "пик",
}
VALUES = [
    ("2", 2), ("3", 3), ("4", 4), ("5", 5), ("6", 6), ("7", 7), ("8", 8),
    ("9", 9), ("10", 10), ("J", 11), ("Q", 12), ("K", 13), ("A", 14),
]


def build_deck() -> list[dict]:
    """Стандартная колода 52 карты: сила 2…14"""
    return [
        {
            "name": f"{value} {SUITS[suit]}",
            "suit": suit,
            "value": value,
            "power": power,
        }
        for suit in SUITS
        for value, power in VALUES
    ]


async def seed_cards():
    """Заполняет справочник карт, если он пуст.

    Без этого старт партии падает с empty_deck: db_seed_cards.sql написан
    под MySQL и на SQLite не накатывается.
    """
    from sqlalchemy import func, select

    from app.models.models import Card

    async with async_session() as session:
        count = await session.scalar(select(func.count()).select_from(Card))
        if count:
            return
        session.add_all(Card(**card) for card in build_deck())
        await session.commit()
        logger.info("Cards seeded: 52 cards")


def _literal_default(column) -> str:
    """Константа DEFAULT для новой NOT NULL колонки (SQLite принимает только константы)."""
    default = column.default
    if default is not None and not default.is_callable:
        value = default.arg
        if isinstance(value, str):
            return "'" + value.replace("'", "''") + "'"
        if isinstance(value, bool):
            return "1" if value else "0"
        if isinstance(value, (int, float)):
            return str(value)
    # Fallback по типу колонки
    if isinstance(column.type, Numeric):
        return "0"
    if isinstance(column.type, String):
        return "''"
    if isinstance(column.type, JSON):
        return "'{}'"
    return "'1970-01-01 00:00:00'"


def _add_missing_columns(conn):
    """Добавляет в существующие SQLite-таблицы колонки, появившиеся в моделях.

    create_all умеет лишь создавать отсутствующие таблицы, но не менять уже
    существующие. Без этого шага любая новая колонка в модели приводит к
    sqlite3.OperationalError: no such column.
    """
    inspector = inspect(conn)
    existing_tables = set(inspector.get_table_names())

    for table in Base.metadata.tables.values():
        if table.name not in existing_tables:
            continue
        known = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in known:
                continue
            col_type = column.type.compile(dialect=conn.dialect)
            ddl = [f'"{column.name}"', col_type]
            if column.nullable:
                ddl.append("NULL")
            else:
                ddl.extend(["NOT NULL", f"DEFAULT {_literal_default(column)}"])
            conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN {" ".join(ddl)}'))
            logger.info("SQLite: added column %s.%s", table.name, column.name)

