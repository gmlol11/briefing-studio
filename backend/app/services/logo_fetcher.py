"""Безопасное получение байтов логотипа (PNG/JPEG) для DOCX-экспорта.

Поддерживает `http`/`https` и `data:`-URI. Любая проблема (пустой/битый URL,
не-image, SSRF-подозрительный хост, таймаут, превышение размера) → возвращается
`None` и наружу не пробрасывается. Сеть изолирована здесь, чтобы docx_export
оставался pure-модулем без HTTP.
"""

import base64
import binascii
import ipaddress
import logging
import re
import socket
from urllib.parse import urlsplit

import httpx

logger = logging.getLogger(__name__)

_MAX_BYTES = 2 * 1024 * 1024  # 2 MB
_TIMEOUT_SECONDS = 4.0
_ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg"}
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_JPEG_MAGIC = b"\xff\xd8\xff"
_DATA_URI_RE = re.compile(
    r"^data:(?P<mime>[^;,]*)(?P<b64>;base64)?,(?P<data>.*)$", re.DOTALL
)


def _has_allowed_magic(data: bytes) -> bool:
    """Байты начинаются с сигнатуры PNG или JPEG."""
    return data.startswith(_PNG_MAGIC) or data.startswith(_JPEG_MAGIC)


def _is_allowed_image_content_type(content_type: str | None) -> bool:
    if not content_type:
        return False
    main = content_type.split(";", 1)[0].strip().lower()
    return main in _ALLOWED_CONTENT_TYPES


def _is_safe_public_host(host: str | None) -> bool:
    """Хост резолвится только в публичные адреса (защита от SSRF).

    Любой приватный/loopback/link-local/reserved/multicast/unspecified адрес →
    небезопасно. Применяется всегда, включая dev.
    """
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            return False
    return True


def _decode_data_uri(url: str) -> bytes | None:
    """`data:image/png|jpeg;base64,...` → bytes; всё прочее → None."""
    match = _DATA_URI_RE.match(url)
    if not match:
        return None
    mime = match.group("mime").strip().lower()
    if mime not in _ALLOWED_CONTENT_TYPES or not match.group("b64"):
        return None
    try:
        data = base64.b64decode(match.group("data"), validate=True)
    except (binascii.Error, ValueError):
        return None
    if not data or len(data) > _MAX_BYTES or not _has_allowed_magic(data):
        return None
    return data


def _fetch_http_logo(url: str) -> bytes | None:
    """Скачать логотип по http(s) с SSRF/size/type-гардами; ошибки → None."""
    if not _is_safe_public_host(urlsplit(url).hostname):
        logger.warning("logo fetch blocked: unsafe or unresolved host")
        return None
    try:
        with httpx.stream(
            "GET", url, timeout=_TIMEOUT_SECONDS, follow_redirects=False
        ) as response:
            if response.status_code != 200:
                return None
            if not _is_allowed_image_content_type(response.headers.get("content-type")):
                return None
            declared = response.headers.get("content-length")
            if declared and declared.isdigit() and int(declared) > _MAX_BYTES:
                return None
            buffer = bytearray()
            for chunk in response.iter_bytes():
                buffer.extend(chunk)
                if len(buffer) > _MAX_BYTES:
                    return None
            data = bytes(buffer)
    except httpx.HTTPError:
        logger.warning("logo fetch failed (network/timeout)")
        return None
    if not data or not _has_allowed_magic(data):
        return None
    return data


def fetch_logo_bytes(url: str | None) -> bytes | None:
    """Вернуть байты валидного PNG/JPEG-логотипа или None.

    Поддерживаются схемы `http`, `https`, `data:`. Любая ошибка/несоответствие
    (пустой URL, чужая схема, не-image, битые данные, SSRF, таймаут, превышение
    2 MB) → None. Никогда не бросает исключение.
    """
    if not url or not url.strip():
        return None
    url = url.strip()
    try:
        scheme = urlsplit(url).scheme.lower()
    except ValueError:
        return None
    if scheme == "data":
        return _decode_data_uri(url)
    if scheme in ("http", "https"):
        return _fetch_http_logo(url)
    return None
