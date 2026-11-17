"""Настройка логирования приложения.

При каждом запуске в папке log/ создаётся отдельный файл
card_api_log_<дата>_<время>.log, куда пишутся все сообщения приложения
(HTTP-операции, WebSocket, БД, игровые действия). Одновременно логи
дублируются в консоль.

Кодировка файлов — utf-8, так как сообщения содержат кириллицу.
"""

import logging
import sys
from datetime import datetime
from pathlib import Path

LOG_FILE_PREFIX = "card_api_log_"
LOG_FILE_SUFFIX = ".log"
# Маркер наших хендлеров: по нему снимаем старые хендлеры при повторном
# вызове setup_logging (повторные запуски lifespan в тестах, reload-воркеры).
_HANDLER_MARK = "_carddrop_handler"

LOG_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def log_file_name(now: datetime | None = None) -> str:
    """Имя файла лога вида card_api_log_2026-11-11_10-15-30.log"""
    stamp = (now or datetime.now()).strftime("%Y-%m-%d_%H-%M-%S")
    return f"{LOG_FILE_PREFIX}{stamp}{LOG_FILE_SUFFIX}"


def _drop_own_handlers(root: logging.Logger) -> None:
    for handler in list(root.handlers):
        if getattr(handler, _HANDLER_MARK, False):
            root.removeHandler(handler)
            handler.close()


def setup_logging(
    log_dir: str | Path = "log",
    level: str = "INFO",
    to_console: bool = True,
) -> Path:
    """Настраивает root-логгер: файл в log/ + консоль.

    Возвращает путь созданного файла лога. Функция идемпотентна: повторный
    вызов не добавляет дублирующиеся хендлеры.
    """
    directory = Path(log_dir)
    directory.mkdir(parents=True, exist_ok=True)
    log_path = directory / log_file_name()

    numeric_level = getattr(logging, level.upper(), logging.INFO)
    formatter = logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)

    file_handler = logging.FileHandler(log_path, mode="a", encoding="utf-8")
    file_handler.setFormatter(formatter)
    setattr(file_handler, _HANDLER_MARK, True)

    root = logging.getLogger()
    _drop_own_handlers(root)
    root.setLevel(numeric_level)
    root.addHandler(file_handler)

    if to_console:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(formatter)
        setattr(console_handler, _HANDLER_MARK, True)
        root.addHandler(console_handler)

    # SQLAlchemy шумит на INFO при каждом коммите/запросе
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)

    logging.getLogger(__name__).info("Log file: %s", log_path)
    return log_path
