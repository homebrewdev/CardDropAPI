"""Middleware логирования всех HTTP-операций API.

Чистый ASGI-middleware (не BaseHTTPMiddleware): WebSocket-соединения
протокатируются дальше без изменений, а тело запроса перехватывается
неблокирующе, через обёртку над receive.

На каждую операцию пишется одна строка:
    [req-id] METHOD путь?query -> статус 12.34ms ip=... body={...}
"""

import logging
import time
import uuid

from starlette.datastructures import Headers

logger = logging.getLogger("carddrop.access")

# Тело запроса логируется не полностью: только JSON-запросы и только первые
# MAX_BODY_LOG_BYTES байт.
MAX_BODY_LOG_BYTES = 2000
LOG_BODY_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Шумные служебные маршруты пишем на DEBUG, чтобы не засорять INFO-поток.
DEBUG_ONLY_PATHS = {"/health", "/docs", "/openapi.json", "/redoc", "/favicon.ico"}


def _client_ip(scope) -> str:
    client = scope.get("client")
    if not client:
        return "-"
    headers = Headers(scope=scope)
    forwarded = headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return client[0]


def _full_path(scope) -> str:
    path = scope.get("path", "")
    query = scope.get("query_string", b"").decode("utf-8", "replace")
    return f"{path}?{query}" if query else path


def _should_log_body(method: str, headers: Headers) -> bool:
    if method not in LOG_BODY_METHODS:
        return False
    content_type = headers.get("content-type", "")
    return "json" in content_type or "urlencoded" in content_type


class AccessLogMiddleware:
    """Логирует каждый HTTP-запрос: метод, путь, статус, длительность, клиента."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = uuid.uuid4().hex[:8]
        method = scope.get("method", "-")
        path = _full_path(scope)
        ip = _client_ip(scope)
        headers = Headers(scope=scope)
        user_agent = headers.get("user-agent", "-")
        capture_body = _should_log_body(method, headers)

        state = {"status": 500, "response_bytes": 0, "exception": None}
        body = bytearray()

        async def receive_wrapper():
            message = await receive()
            if capture_body and message["type"] == "http.request":
                remaining = MAX_BODY_LOG_BYTES - len(body)
                if remaining > 0:
                    body.extend(message.get("body", b"")[:remaining])
            return message

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                state["status"] = message["status"]
                raw_headers = list(message.get("headers", []))
                raw_headers.append((b"x-request-id", request_id.encode("latin-1")))
                message = {**message, "headers": raw_headers}
            elif message["type"] == "http.response.body":
                state["response_bytes"] += len(message.get("body", b""))
            await send(message)

        started = time.perf_counter()
        try:
            await self.app(scope, receive_wrapper, send_wrapper)
        except Exception as exc:  # noqa: BLE001
            state["exception"] = exc
            state["status"] = 500
            logger.exception(
                "[%s] %s %s -> 500 unhandled %s ip=%s",
                request_id, method, path, exc.__class__.__name__, ip,
            )
            raise
        finally:
            elapsed_ms = (time.perf_counter() - started) * 1000
            if state["exception"] is None:
                self._log_line(method, path, state, elapsed_ms, ip, user_agent, body, request_id)
    def _log_line(
        self,
        method: str,
        path: str,
        state: dict,
        elapsed_ms: float,
        ip: str,
        user_agent: str,
        body: bytearray,
        request_id: str,
    ) -> None:
        status = state["status"]
        if status >= 500:
            level = logging.ERROR
        elif status >= 400:
            level = logging.WARNING
        else:
            level = logging.DEBUG if path.split("?")[0] in DEBUG_ONLY_PATHS else logging.INFO

        if not logger.isEnabledFor(level):
            return

        parts = [
            f"[{request_id}] {method} {path} -> {status}",
            f"{elapsed_ms:.2f}ms",
            f"ip={ip}",
            f"resp={state['response_bytes']}B",
        ]
        if body:
            payload = bytes(body).decode("utf-8", "replace")
            if len(payload) >= MAX_BODY_LOG_BYTES:
                payload += "...(truncated)"
            parts.append(f"body={payload}")
        if user_agent != "-":
            parts.append(f'ua="{user_agent}"')

        logger.log(level, " ".join(parts))
