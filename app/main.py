import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.sessions import router as sessions_router
from app.ws.ws_handler import router as ws_router
from app.rooms.room_manager import RoomManager
from app.config import get_settings
from app.db import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()
room_manager = RoomManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting CardDropAPI...")
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

# Routers
app.include_router(sessions_router)
app.include_router(ws_router)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
