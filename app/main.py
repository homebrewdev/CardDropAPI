import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.sessions import router as sessions_router
from app.ws.ws_handler import router as ws_router
from app.rooms.room_manager import RoomManager
from app.config import get_settings
from app.db import init_db
from app.logging_config import setup_logging
from app.middleware import AccessLogMiddleware

logger = logging.getLogger(__name__)

settings = get_settings()
room_manager = RoomManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Файл лога создаётся на каждый запуск: log/card_api_log_<дата>_<время>.log
    log_file = setup_logging(
        log_dir=settings.LOG_DIR,
        level=settings.LOG_LEVEL,
        to_console=settings.LOG_TO_CONSOLE,
    )
    app.state.log_file = log_file
    logger.info("Starting CardDropAPI... (log file: %s)", log_file)
    await init_db()
    logger.info("Database tables created")
    yield
    logger.info("Shutting down CardDropAPI...")


app = FastAPI(
    title="CardDropAPI",
    description="Backend for card game with 2-4 players",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
allowed_origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Логирование всех HTTP-операций. Добавляется последним, чтобы быть внешним
# слоем и видеть итоговый статус ответа, включая ошибки CORS.
app.add_middleware(AccessLogMiddleware)

# Routers
app.include_router(sessions_router)
app.include_router(ws_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
