"""Аватарки игроков.

Клиент присылает картинку как data URL (PNG/JPEG/WebP, уже уменьшенную под
кружок). Храним её в Player.avatar как есть. Наружу — в снапшотах и REST —
отдаём не саму картинку, а короткую ссылку на неё с версией: браузер
скачивает аватарку один раз и кеширует, а снапшоты остаются лёгкими.
"""
import base64
import binascii
import re
import zlib
from typing import Optional, Tuple

# Аватарка ~60×60 (×devicePixelRatio) — десятки килобайт с большим запасом
MAX_AVATAR_CHARS = 200_000

_DATA_URL = re.compile(r"^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$")

# Сигнатуры форматов: защищает от «картинок», которые ими не являются
_MAGIC = {
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/webp": (b"RIFF",),
}


class AvatarError(ValueError):
    pass


def parse_avatar(data_url: str) -> Tuple[str, bytes]:
    """Проверить data URL аватарки. Возвращает (mime, байты картинки)."""
    if not isinstance(data_url, str) or len(data_url) > MAX_AVATAR_CHARS:
        raise AvatarError("Аватарка слишком большая")
    m = _DATA_URL.match(data_url)
    if not m:
        raise AvatarError("Аватарка должна быть картинкой PNG, JPEG или WebP")
    mime, b64 = m.groups()
    try:
        raw = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise AvatarError("Повреждённая картинка")
    if not raw.startswith(_MAGIC[mime]) or (mime == "image/webp" and raw[8:12] != b"WEBP"):
        raise AvatarError("Файл не похож на картинку")
    return mime, raw


def avatar_url(player_id: int, avatar: Optional[str]) -> Optional[str]:
    """Ссылка на аватарку для клиентов; версия меняется вместе с картинкой."""
    if not avatar:
        return None
    version = format(zlib.crc32(avatar.encode()) & 0xFFFFFFFF, "08x")
    return f"/api/players/{player_id}/avatar?v={version}"
