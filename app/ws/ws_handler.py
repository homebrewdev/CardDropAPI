import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.models import Session, Player
from app.rooms.room_manager import GameActionError
from app.schemas.schemas import (
    WSReady,
    WSPlayCard,
    WSPass,
    WSFold,
    WSStart,
    WSSetBet,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["websocket"])


async def get_room_manager():
    """Ленивая загрузка room_manager из main, чтобы избежать циклического импорта"""
    from app.main import room_manager

    return room_manager


@router.websocket("/join/{join_code}")
async def websocket_join(
    websocket: WebSocket,
    join_code: str,
    nickname: str = "",
):
    """Подключение к игровой комнате.

    nickname передаётся как query-параметр: /ws/join/{join_code}?nickname=Alice
    """
    await websocket.accept()

    if not nickname or len(nickname) < 1 or len(nickname) > 30:
        await websocket.close(code=4000, reason="Invalid nickname")
        return

    room_manager = await get_room_manager()
    player = None

    # --- Поиск/создание игрока ---
    try:
        async for db in get_db():
            result = await db.execute(
                select(Session).where(Session.join_code == join_code)
            )
            session_obj = result.scalar_one_or_none()

            if not session_obj:
                await websocket.close(code=4001, reason="Session not found")
                return

            if session_obj.status != "waiting":
                await websocket.close(code=4005, reason="Session already started")
                return

            if len(session_obj.players) >= session_obj.max_players:
                await websocket.close(code=4006, reason="Session is full")
                return

            result = await db.execute(
                select(Player).where(
                    Player.session_id == session_obj.id,
                    Player.nickname == nickname,
                )
            )
            player = result.scalar_one_or_none()

            if not player:
                player = Player(session_id=session_obj.id, nickname=nickname)
                db.add(player)
                await db.commit()
                await db.refresh(player)

            await room_manager.join(join_code, player, db, websocket)
            break  # выходим из async for — соединение установлено

    except Exception as e:
        logger.exception("Error on WS join")
        try:
            await websocket.close(code=4002, reason=str(e)[:100])
        except Exception:
            pass
        return

    # --- Основной цикл сообщений ---
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")

            try:
                if action == "ready":
                    ready_data = WSReady(**data)
                    async for db in get_db():
                        result = await room_manager.handle_ready(
                            ready_data.player_id, db
                        )
                        await room_manager.broadcast_all(player.id, result)
                        break

                elif action == "set_bet":
                    bet_data = WSSetBet(**data)
                    async for db in get_db():
                        await room_manager.handle_set_bet(
                            player.id, bet_data.bet, db
                        )
                        break

                elif action == "start":
                    # Запуск партии (любой игрок может нажать, сервер решит)
                    start_data = WSStart(**data)
                    async for db in get_db():
                        await room_manager.start_round(
                            join_code, db, ante=start_data.ante
                        )
                        break

                elif action == "play_card":
                    play_data = WSPlayCard(**data)
                    async for db in get_db():
                        await room_manager.handle_play_card(
                            play_data.player_id,
                            play_data.card_id,
                            play_data.client_action_id,
                            db,
                        )
                        break

                elif action in ("pass", "fold"):
                    fold_data = WSFold(**{**data, "action": "fold"}) if action == "fold" else WSPass(**data)
                    async for db in get_db():
                        await room_manager.handle_fold(
                            fold_data.player_id,
                            fold_data.client_action_id,
                            db,
                            action_type="pass" if action == "pass" else "discard",
                        )
                        break

                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown action: {action}",
                    })

            except GameActionError as e:
                # Нарушение правила — соединение сохраняем
                await websocket.send_json(
                    {"type": "error", "error_type": e.error_type, "message": e.message}
                )
            except ValidationError as e:
                await websocket.send_json(
                    {
                        "type": "error",
                        "error_type": "invalid_payload",
                        "message": e.errors()[0].get("msg", str(e))[:150]
                        if e.errors()
                        else str(e)[:150],
                    }
                )

    except WebSocketDisconnect:
        logger.info(f"Player {player.nickname} disconnected")
    except Exception as e:
        logger.exception("WS error")
        try:
            await websocket.send_json({"type": "error", "message": str(e)[:100]})
        except Exception:
            pass
    finally:
        try:
            async for db in get_db():
                await room_manager.leave(player.id, db)
                break
        except Exception:
            logger.exception("Error on WS cleanup")
