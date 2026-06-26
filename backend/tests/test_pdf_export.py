"""PDF export — markdown→HTML + template unit tests, plus Chromium build_pdf."""

import base64
import os

import pytest

from app.services import pdf_export
from app.services.pdf_export import _markdown_to_html, _render_html, build_pdf

# 1x1 PNG, который распознаёт Chromium/python-docx (валидные байты)
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ"
    "/pLvAAAAAElFTkSuQmCC"
)

MD = "# Бриф\n\n## Цель\n\n- первый **пункт**\n- второй\n\nфинальный абзац"


def _chromium_available() -> bool:
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            return os.path.exists(pw.chromium.executable_path)
    except Exception:
        return False


requires_chromium = pytest.mark.skipif(
    not _chromium_available(), reason="Playwright Chromium not installed"
)


# --- markdown → HTML ------------------------------------------------------


def test_markdown_to_html_blocks():
    out = _markdown_to_html(MD)
    assert "<h1>Бриф</h1>" in out
    assert "<h2>Цель</h2>" in out
    assert "<ul>" in out and "<li>первый <strong>пункт</strong></li>" in out
    assert "<li>второй</li>" in out
    assert "<p>финальный абзац</p>" in out


def test_markdown_to_html_escapes_script():
    out = _markdown_to_html("<script>alert(1)</script>")
    assert "<script>" not in out
    assert "&lt;script&gt;" in out


def test_markdown_to_html_escapes_inside_bold():
    out = _markdown_to_html("**<b>x</b>**")
    assert "<strong>&lt;b&gt;x&lt;/b&gt;</strong>" in out
    assert "<b>" not in out


# --- HTML template --------------------------------------------------------


def _render(**kwargs):
    base = dict(
        body_html="<p>body</p>",
        title="t",
        brand_name=None,
        document_label=None,
        date_text=None,
        logo_data_uri=None,
        accent=None,
        font=None,
    )
    base.update(kwargs)
    return _render_html(**base)


def test_render_html_contains_header_and_body():
    html_doc = _render(
        brand_name="Север",
        document_label="Креативный бриф",
        date_text="25.06.2026",
        logo_data_uri=pdf_export._logo_data_uri(PNG_BYTES),
        accent="#1f6feb",
        font="Georgia",
    )
    assert "Север" in html_doc
    assert "Креативный бриф · 25.06.2026" in html_doc
    assert "<p>body</p>" in html_doc
    assert "data:image/png;base64," in html_doc
    assert "#1f6feb" in html_doc
    assert '"Georgia"' in html_doc


def test_render_html_empty_identity_has_no_header():
    html_doc = _render()
    assert "<hr class=\"divider\">" not in html_doc
    assert "class=\"brand\"" not in html_doc
    assert "<p>body</p>" in html_doc  # тело на месте


def test_render_html_brand_name_is_escaped():
    html_doc = _render(brand_name="<script>x</script>")
    assert "<script>x</script>" not in html_doc
    assert "&lt;script&gt;" in html_doc


def test_safe_color_rejects_garbage():
    assert pdf_export._safe_color("red") is None
    assert pdf_export._safe_color("#1f6feb") == "#1f6feb"
    # битый цвет не попадает в CSS
    assert "expression(" not in _render(accent=pdf_export._safe_color("expression(alert(1))") or "")


def test_safe_font_strips_dangerous_chars():
    assert pdf_export._safe_font("Inter") == "Inter"
    assert pdf_export._safe_font("Times New Roman") == "Times New Roman"
    # CSS-опасные символы (кавычки, скобки, точка с запятой) вырезаются
    cleaned = pdf_export._safe_font('Bad";} body{x')
    assert all(c not in cleaned for c in '";}{')
    assert pdf_export._safe_font("") is None


def test_logo_data_uri_none():
    assert pdf_export._logo_data_uri(None) is None
    assert pdf_export._logo_data_uri(b"").__class__ is type(None)


# --- real PDF generation (Chromium) ---------------------------------------


@pytest.mark.pdf
@requires_chromium
def test_build_pdf_with_identity_returns_pdf():
    data = build_pdf(
        MD,
        title="Тест",
        identity={"accent_color": "#1f6feb", "font_family": "Georgia"},
        brand_name="Север",
        document_label="Креативный бриф",
        date_text="25.06.2026",
        logo_bytes=PNG_BYTES,
    )
    assert data[:5] == b"%PDF-"
    assert len(data) > 800


@pytest.mark.pdf
@requires_chromium
def test_build_pdf_without_identity_returns_pdf():
    data = build_pdf(MD)
    assert data[:5] == b"%PDF-"
