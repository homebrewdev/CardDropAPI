# 🃏 CardDropAPI — журнал изменений (KODA)

Служебный файл Koda. Здесь фиксируются **итерации** — выполненные и проверенные задачи.
Новая итерация добавляется **после** успешного выполнения задания: изменения в коде +
результат проверки. Пустые/непроверенные записи не оставляем.

Формат записи:

```
## Итерация N — <краткое название>     (дата)
- Задача: что и зачем
- Изменено: файлы и суть правок
- Проверено: как именно подтвердили работоспособность
- Статус: ✅ / ⚠️ с пояснением
```

---

## Итерация 1 — Автосинхронизация схемы SQLite     (2026-11-11)

- **Задача:** сервер падал на `sqlite3.OperationalError: no such column: sessions.ante`.
  Файл `cardgame.db` создан до появления новых полей в моделях, а `create_all()`
  не меняет уже существующие таблицы.
- **Изменено:**
  - `app/db.py` — `init_db()` после `create_all` вызывает `_add_missing_columns()`:
    сравнивает `Base.metadata` с реальной схемой через `inspect` и дозаполняет
    недостающие колонки через `ALTER TABLE ... ADD COLUMN`.
  - `_literal_default()` — для `NOT NULL`-колонок SQLite требует константный
    `DEFAULT`: берём `default=` из модели, иначе fallback по типу
    (`0` / `''` / `'{}'` / `'1970-01-01 00:00:00'`).
  - Только для `DB_DIALECT=sqlite`; операции аддитивны и идемпотентны.
- **Добавлено в `cardgame.db`:** `sessions.ante|games_played|winner_nickname`,
  `players.bet|folded`, `rounds.current_turn_player_id|leader_player_id|current_power|is_tiebreak|is_closed`
  (10 колонок). Данные сохранены.
- **Проверено:** запрос из трейсбека `select(Session).where(Session.name == "test")`
  выполняется; повторный `init_db()` ничего не делает; uvicorn стартует,
  `POST/GET /api/sessions*` и `/health` отвечают корректно.
- **Статус:** ✅

## Итерация 2 — Прозрачная причина 409 Conflict     (2026-11-11)

- **Задача:** `POST /api/sessions` отдавал 409, а клиент показывал бесполезное
  «Ошибка: HTTP 409».
- **Изменено:**
  - `frontend/src/App.tsx` — убран дублирующий `fetch` с заглушкой `HTTP ${status}`;
      создание игры идёт через `createSession` из `frontend/src/api.ts`, который
      читает поле `detail` ответа.
  - `app/api/sessions.py` — текст `detail` стал осмысленным; `commit()` обёрнут в
      `try/except IntegrityError` (проверка «SELECT → INSERT» не атомарна, при
      гонке дублирующего имени был бы 500 вместо 409).
- **Проверено:** живым сервером — 409 с текстом причины для занятого имени,
  201 для нового, 409 при гонке; `npx tsc --noEmit` без ошибок.
- **Статус:** ✅

## Итерация 3 — Убран UNIQUE с sessions.name     (2026-11-11)

- **Задача:** по просьбе пользователя разрешить несколько сессий с одинаковым
  названием. Идентификатором комнаты остаётся `join_code`.
- **Изменено:**
  - `app/models/models.py` — снят `unique=True` с `Session.name`.
  - `app/api/sessions.py` — удалена проверка уникальности имени; `IntegrityError`
      оставлен как страховка коллизии `join_code`.
  - `cardgame.db` — таблица `sessions` перестроена (SQLite не умеет `DROP INDEX`
      для автоиндексов): `UNIQUE(name)` убран, `UNIQUE(join_code)` сохранён,
      все строки перенесены.
  - `db_schema.sql` — `UNIQUE KEY uk_sessions_name` → `KEY idx_sessions_name`.
  - `tests/test_api.py` — `test_duplicate_session_name` переписан на
      `test_duplicate_session_name_allowed`: два 201 + разные `join_code`.
- **Проверено:** два `POST` с одним именем → 201/201 с разными кодами; коллизия
  `join_code` по-прежнему блокируется (`IntegrityError`); `players` → `sessions`
  через `PRAGMA foreign_key_check` = OK; `pytest tests/test_api.py` — 8 passed.
- **Статус:** ✅

## Итерация 4 — Логирование всех операций API + папка log/     (2026-11-11)

- **Задача:** писать все HTTP-операции в файлы `log/card_api_log_дата_время.log`.
- **Изменено:**
  - `app/logging_config.py` (новый) — `setup_logging()` создаёт `log/` и файл
    `card_api_log_ГГГГ-ММ-ДД_ЧЧ-ММ-СС.log` (utf-8) на каждый запуск + дубль в
    консоль. Идемпотентен: свои хендлеры помечены маркером и снимаются при
    повторном вызове. Формат: `дата | уровень | логгер | сообщение`.
  - `app/middleware.py` (новый) — `AccessLogMiddleware`, чистый ASGI (не
    `BaseHTTPMiddleware`, чтобы не ломать WebSocket). Логирует `[req-id] METHOD
    путь?query -> статус ms ip=… resp=…B body=… ua=…`; тело читается только для
    JSON POST/PUT/PATCH/DELETE и не длиннее 2000 байт. Уровни: 5xx → ERROR,
    4xx → WARNING, служебные маршруты (`/health`, `/docs`, …) → DEBUG. В ответ
    добавляется заголовок `X-Request-ID` для связки с логом.
  - `app/main.py` — `setup_logging()` вызывается в `lifespan`, middleware
    подключён внешним слоем; `logging.basicConfig` удалён.
  - `app/api/sessions.py`, `app/ws/ws_handler.py` — прикладные строки: создание
    сессии, подключение/отключение WS, каждое действие, отказы (полная/занятая/
    незнакомый код, `GameActionError`, `ValidationError`).
  - `app/config.py`, `.env.example` — настройки `LOG_DIR`, `LOG_LEVEL`,
    `LOG_TO_CONSOLE`. `.gitignore` — игнор `log/`. `README.md` — раздел «Логи».
  - Попутно исправлен баг, блокировавший любой вход по WS: `room_manager` писал в
    `Session.current_players`, которой не было в модели → `Unconsumed column names`
    и закрытие соединения кодом 4002. Колонка добавлена в `app/models/models.py`
    и автоматически создана миграцией из итерации 1.
- **Проверено:**
  - при старте создаётся ровно один файл за пуск; два последовательных пуска с
    разным `LOG_LEVEL` дали два файла;
  - в файл пишутся все операции: `POST /api/sessions -> 201` с телом,
    `GET /api/sessions -> 200`, `404`, `422`, `GET /health` (INFO/DEBUG);
  - цикл WS в логе: connect → player created → action ready → unknown action →
    invalid payload → disconnect → rejected (незнакомый join_code);
  - `pytest tests/test_api.py` — 8 passed.
- **Статус:** ✅

---

## Известные проблемы (не входят в выполненные итерации)

- `tests/test_rules.py` — 15 падений: фикстура `make_session` создаёт игроков без
  `score`, а `room_manager.start_round` фильтрует `p.score != 0` и падает с
  `not_enough_funds`. Баг существовал до этих итераций и к ним не относится.
- `requirements.txt` — дубль `sqlalchemy[asyncio]` и опечатка `sqlalchemy[asincio]`;
  `pytest`/`pytest-asyncio`/`httpx` не перечислены, хотя тесты в репозитории есть.
- `db_schema.sql` (MySQL) отстаёт от моделей: нет `join_code`, `ante`,
  `games_played`, `winner_nickname`, `bet`, `folded` и новых колонок `rounds`.
  Для MySQL нужна миграция через Alembic (он есть в зависимостях, но конфигурация
  не создана) — авто-`ALTER` реализован только для SQLite.
