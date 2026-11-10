# 🃏 CardDrop

Веб-игра в карты на 2–4 человека.

## Архитектура

```
frontend/  →  React + Vite + TypeScript
backend/   →  FastAPI + WebSocket + SQLAlchemy
MySQL/SQLite  →  Хранение сессий, игроков, карт, раундов
Redis       →  Горячее состояние (опционально)
```

## Быстрый старт

### 1. Бэкенд

Всё запускается из виртуального окружения `.venv`. Системный Python не подойдёт:
нужна SQLAlchemy 2.x.

```bash
python -m venv .venv                     # один раз
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

(Linux/macOS: `.venv/bin/python` вместо `.venv\Scripts\python`.)

Сервер: http://localhost:8000  
Swagger: http://localhost:8000/docs

### 2. Фронтенд

```bash
cd frontend
npm install
npm run dev
```

Фронтенд: http://localhost:5173

### 3. Тесты

```bash
.venv\Scripts\python -m pytest tests/ -v
```

## API

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/sessions` | Создать сессию |
| GET | `/api/sessions` | Список сессий |
| GET | `/api/sessions/{id}` | Информация о сессии |
| WS | `/ws/join/{join_code}?nickname=name` | Подключение к комнате |

## WebSocket-протокол

### Сообщения клиента

```json
{"action": "ready", "player_id": 1}
{"action": "start"}
{"action": "play_card", "player_id": 1, "card_id": 42, "client_action_id": "uuid"}
{"action": "pass", "player_id": 1, "client_action_id": "uuid"}
```

### Сообщения сервера

```json
{"type": "game_state", "session_status": "playing", "my_cards": [...], "other_players": [...]}
{"type": "player_joined", "player_id": 2, "nickname": "Bob"}
{"type": "player_left", "player_id": 1}
{"type": "player_ready", "player_id": 1, "is_ready": true}
{"type": "round_started", "round_number": 1, "cards_per_player": 5}
{"type": "error", "message": "..."}
```

## Структура БД

| Таблица | Назначение |
|---|---|
| `sessions` | Игровая сессия (join_code, статус) |
| `players` | Игроки в сессии (ник, очки, готовность) |
| `cards` | Справочник карт (масть, значение, сила) |
| `decks` | Колода конкретной сессии |
| `player_cards` | Карты в руке игрока |
| `rounds` | Раунды внутри сессии |
| `round_actions` | Действия в раунде |

## Конфигурация

Файл `.env`:

```env
DB_DIALECT=sqlite          # sqlite | mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=carduser
DB_PASSWORD=cardpass
DB_NAME=cardgame
REDIS_HOST=localhost
REDIS_PORT=6379
ALLOWED_ORIGINS=http://localhost:5173
```

Для MySQL: `DB_DIALECT=mysql` + запустить `docker compose up -d mysql`.

## Скрипты

| Файл | Описание |
|---|---|
| `db_schema.sql` | Схема MySQL |
| `db_seed_cards.sql` | Колода 52 карты |
| `docker-compose.yml` | MySQL + Redis |

## Что реализовано

- ✅ REST API: создание/получение сессий
- ✅ WebSocket: подключение к комнате по коду
- ✅ Вход по join_code с никнеймом
- ✅ Ограничение 2–4 игрока
- ✅ Раздача карт (5 каждому)
- ✅ Ходы: play_card, pass
- ✅ Идемпотентность (client_action_id)
- ✅ React-интерфейс: лобби, ожидание, игровой стол
- ✅ 8 pytest-тестов

## Что дальше

- ⬜ Подсчёт очков и завершение раунда
- ⬜ Авторизация
- ⬜ Анимации карт (Framer Motion)
- ⬜ Реалтайм-таймеры хода
- ⬜ Redis для состояния (при 2+ воркерах)
