from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

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
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

