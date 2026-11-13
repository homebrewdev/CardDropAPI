"""Тесты для REST API"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from uuid import uuid4

from app.main import app


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _name():
    return f"Test_{uuid4().hex[:6]}"


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_create_session(client: AsyncClient):
    resp = await client.post(
        "/api/sessions",
        json={"name": _name(), "max_players": 4},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "waiting"
    assert len(data["join_code"]) == 8


@pytest.mark.asyncio
async def test_list_sessions(client: AsyncClient):
    await client.post(
        "/api/sessions",
        json={"name": _name(), "max_players": 2},
    )
    resp = await client.get("/api/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1


@pytest.mark.asyncio
async def test_duplicate_session_name_allowed(client: AsyncClient):
    """Название больше не уникально — можно создать несколько сессий с одинаковым именем."""
    name = _name()
    r1 = await client.post("/api/sessions", json={"name": name, "max_players": 4})
    assert r1.status_code == 201
    r2 = await client.post("/api/sessions", json={"name": name, "max_players": 4})
    assert r2.status_code == 201
    # join_code у каждой сессии свой
    assert r1.json()["join_code"] != r2.json()["join_code"]


@pytest.mark.asyncio
async def test_get_session(client: AsyncClient):
    resp = await client.post(
        "/api/sessions",
        json={"name": _name(), "max_players": 3},
    )
    session_id = resp.json()["id"]

    resp = await client.get(f"/api/sessions/{session_id}")
    assert resp.status_code == 200
    assert resp.json()["max_players"] == 3


@pytest.mark.asyncio
async def test_get_session_not_found(client: AsyncClient):
    resp = await client.get("/api/sessions/999999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_session_invalid_max_players(client: AsyncClient):
    resp = await client.post(
        "/api/sessions",
        json={"name": _name(), "max_players": 5},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_session_no_name(client: AsyncClient):
    resp = await client.post(
        "/api/sessions",
        json={"max_players": 4},
    )
    assert resp.status_code == 422
