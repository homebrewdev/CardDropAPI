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

    client = websocket.client
    client_ip = client[0] if client else "-"
    logger.info(
        "WS connect: join_code=%s nickname=%r ip=%s", join_code, nickname, client_ip
    )

    if not nickname or len(nickname) < 1 or len(nickname) > 30:
        logger.warning("WS rejected: invalid nickname %r from ip=%s", nickname, client_ip)
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
                logger.warning("WS rejected: unknown join_code=%s ip=%s", join_code, client_ip)
                await websocket.close(code=4001, reason="Session not found")
                return

            if session_obj.status != "waiting":
                logger.warning(
                    "WS rejected: session %s already %s (join_code=%s)",
                    session_obj.id, session_obj.status, join_code,
                )
                await websocket.close(code=4005, reason="Session already started")
                return

            result = await db.execute(
                select(Player).where(
                    Player.session_id == session_obj.id,
                    Player.nickname == nickname,
                )
            )
            player = result.scalar_one_or_none()

            # Считаем только реально подключённых: игроки, которые вышли,
            # остаются в БД и иначе навсегда занимают слот в комнате
            connected_now = room_manager.get_room(join_code) or {}
            if player is None and len(connected_now) >= session_obj.max_players:
                logger.warning(
                    "WS rejected: session %s is full (%s/%s)",
                    session_obj.id, len(connected_now), session_obj.max_players,
                )
                await websocket.close(code=4006, reason="Session is full")
                return

            if not player:
                player = Player(session_id=session_obj.id, nickname=nickname)
                db.add(player)
                await db.commit()
                await db.refresh(player)
                logger.info(
                    "Player created: id=%s nickname=%r session=%s",
                    player.id, nickname, session_obj.id,
                )
            else:
                logger.info(
                    "Player rejoining: id=%s nickname=%r session=%s",
                    player.id, nickname, session_obj.id,
                )

            await room_manager.join(join_code, player, db, websocket)
            break  # выходим из async for — соединение установлено

    except Exception as e:
        logger.exception("Error on WS join (join_code=%s nickname=%r)", join_code, nickname)
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
            logger.info("WS action: %s (player=%s, join_code=%s)", action, player.id, join_code)

            try:
                if action == "ready":
                    WSReady(**data)
                    async for db in get_db():
                        # Доверяем только id из соединения: player_id из payload
                        # позволяет действовать от имени другого игрока
                        await room_manager.handle_ready(player.id, db)
                        await room_manager.broadcast_states(join_code, db)
                        break

                elif action == "set_bet":
                    bet_data = WSSetBet(**data)
                    async for db in get_db():
                        await room_manager.handle_set_bet(
                            player.id, bet_data.bet, db
                        )
                        await room_manager.broadcast_states(join_code, db)
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
                            player.id,
                            play_data.card_id,
                            play_data.client_action_id,
                            db,
                        )
                        break

                elif action in ("pass", "fold"):
                    fold_data = WSFold(**{**data, "action": "fold"}) if action == "fold" else WSPass(**data)
                    async for db in get_db():
                        await room_manager.handle_fold(
                            player.id,
                            fold_data.client_action_id,
                            db,
                            action_type="pass" if action == "pass" else "discard",
                        )
                        break

                else:
                    logger.warning("WS unknown action: %r (player=%s)", action, player.id)
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown action: {action}",
                    })

            except GameActionError as e:
                # Нарушение правила — соединение сохраняем
                logger.warning(
                    "WS rule violation: player=%s action=%s type=%s message=%s",
                    player.id, action, e.error_type, e.message,
                )
                await websocket.send_json(
                    {"type": "error", "error_type": e.error_type, "message": e.message}
                )
            except ValidationError as e:
                logger.warning(
                    "WS invalid payload: player=%s action=%s errors=%s",
                    player.id, action, e.errors(),
                )
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
        logger.info("WS disconnect: player=%s nickname=%r join_code=%s", player.id, player.nickname, join_code)
    except Exception as e:
        logger.exception("WS error (player=%s, join_code=%s)", getattr(player, "id", None), join_code)
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
            logger.exception("Error on WS cleanup (player=%s)", getattr(player, "id", None))
