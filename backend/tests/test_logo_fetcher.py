"""logo_fetcher — safe PNG/JPEG retrieval (data: + http) without real network."""

import base64

import httpx
import pytest

from app.services import logo_fetcher
from app.services.logo_fetcher import fetch_logo_bytes

# 1x1 transparent PNG
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChw"
    "GA60e6kgAAAABJRU5ErkJggg=="
)
# минимальные байты с JPEG-сигнатурой (fetcher проверяет только magic + размер)
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01" + b"\x00" * 32


class _FakeStream:
    """Подделка httpx streaming-ответа в роли context manager."""

    def __init__(self, *, status_code=200, headers=None, chunks=(b"",), raise_exc=None):
        self.status_code = status_code
        self.headers = headers or {}
        self._chunks = chunks
        self._raise = raise_exc

    def __enter__(self):
        if self._raise is not None:
            raise self._raise
        return self

    def __exit__(self, *exc):
        return False

    def iter_bytes(self):
        yield from self._chunks


def _patch_http(monkeypatch, **stream_kwargs):
    """Заглушка httpx.stream + обход реального DNS (хост считаем публичным)."""
    fake = _FakeStream(**stream_kwargs)
    monkeypatch.setattr(logo_fetcher.httpx, "stream", lambda *a, **k: fake)
    monkeypatch.setattr(logo_fetcher, "_is_safe_public_host", lambda host: True)


def _data_uri(mime: str, data: bytes) -> str:
    return f"data:{mime};base64," + base64.b64encode(data).decode()


# --- empty / scheme -------------------------------------------------------


@pytest.mark.parametrize("url", [None, "", "   "])
def test_empty_input_returns_none(url):
    assert fetch_logo_bytes(url) is None


@pytest.mark.parametrize(
    "url",
    ["file:///etc/passwd", "ftp://example.com/logo.png", "gopher://x/y"],
)
def test_unsupported_scheme_returns_none(url):
    assert fetch_logo_bytes(url) is None


# --- data: URI ------------------------------------------------------------


def test_valid_data_png_returns_bytes():
    assert fetch_logo_bytes(_data_uri("image/png", PNG_BYTES)) == PNG_BYTES


def test_valid_data_jpeg_returns_bytes():
    assert fetch_logo_bytes(_data_uri("image/jpeg", JPEG_BYTES)) == JPEG_BYTES


def test_data_uri_wrong_mime_returns_none():
    assert fetch_logo_bytes(_data_uri("text/html", b"<html></html>")) is None


def test_data_uri_broken_base64_returns_none():
    assert fetch_logo_bytes("data:image/png;base64,!!!not-base64!!!") is None


def test_data_uri_wrong_magic_returns_none():
    assert fetch_logo_bytes(_data_uri("image/png", b"definitely not a png")) is None


def test_data_uri_oversize_returns_none():
    big = logo_fetcher._PNG_MAGIC + b"\x00" * (logo_fetcher._MAX_BYTES + 1)
    assert fetch_logo_bytes(_data_uri("image/png", big)) is None


def test_data_uri_without_base64_returns_none():
    assert fetch_logo_bytes("data:image/png,rawnotbase64") is None


# --- SSRF / private hosts (числовые IP резолвятся локально, без сети) ------


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/logo.png",
        "http://10.0.0.1/logo.png",
        "http://169.254.169.254/latest/meta-data",
    ],
)
def test_private_or_loopback_host_returns_none(url):
    assert fetch_logo_bytes(url) is None


# --- http(s) (mocked) -----------------------------------------------------


def test_http_valid_png_returns_bytes(monkeypatch):
    _patch_http(monkeypatch, headers={"content-type": "image/png"}, chunks=(PNG_BYTES,))
    assert fetch_logo_bytes("http://cdn.example.com/logo.png") == PNG_BYTES


def test_http_valid_jpeg_returns_bytes(monkeypatch):
    _patch_http(
        monkeypatch, headers={"content-type": "image/jpeg"}, chunks=(JPEG_BYTES,)
    )
    assert fetch_logo_bytes("https://cdn.example.com/logo.jpg") == JPEG_BYTES


def test_http_unsupported_content_type_returns_none(monkeypatch):
    _patch_http(
        monkeypatch, headers={"content-type": "image/gif"}, chunks=(PNG_BYTES,)
    )
    assert fetch_logo_bytes("http://cdn.example.com/logo.gif") is None


def test_http_wrong_magic_returns_none(monkeypatch):
    _patch_http(
        monkeypatch, headers={"content-type": "image/png"}, chunks=(b"<svg/>",)
    )
    assert fetch_logo_bytes("http://cdn.example.com/logo.png") is None


def test_http_oversize_by_content_length_returns_none(monkeypatch):
    _patch_http(
        monkeypatch,
        headers={"content-type": "image/png", "content-length": "3000000"},
        chunks=(PNG_BYTES,),
    )
    assert fetch_logo_bytes("http://cdn.example.com/logo.png") is None


def test_http_oversize_by_stream_returns_none(monkeypatch):
    big = logo_fetcher._PNG_MAGIC + b"\x00" * (logo_fetcher._MAX_BYTES + 10)
    _patch_http(monkeypatch, headers={"content-type": "image/png"}, chunks=(big,))
    assert fetch_logo_bytes("http://cdn.example.com/logo.png") is None


def test_http_non_200_returns_none(monkeypatch):
    _patch_http(
        monkeypatch,
        status_code=404,
        headers={"content-type": "image/png"},
        chunks=(PNG_BYTES,),
    )
    assert fetch_logo_bytes("http://cdn.example.com/logo.png") is None


def test_http_timeout_returns_none(monkeypatch):
    monkeypatch.setattr(logo_fetcher, "_is_safe_public_host", lambda host: True)
    monkeypatch.setattr(
        logo_fetcher.httpx,
        "stream",
        lambda *a, **k: _FakeStream(raise_exc=httpx.ConnectTimeout("boom")),
    )
    assert fetch_logo_bytes("http://cdn.example.com/logo.png") is None
