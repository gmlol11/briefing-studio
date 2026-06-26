"""Брендированный PDF-экспорт (HTML → Playwright/Chromium).

`build_pdf` рендерит letterhead (логотип/бренд/мета/линия) + markdown-тело в PDF
через headless Chromium. HTML собирается на backend (без frontend bundle), весь
динамический текст экранируется, логотип — только data URI из уже безопасных
`logo_bytes`, сеть в браузере заблокирована. Браузер запускается на запрос;
ошибки Playwright/отсутствие Chromium пробрасываются (эндпоинт вернёт 503).
"""

import base64
import html
import re
from typing import Any

_HEADING_RE = re.compile(r"^(#{1,3})\s+(.*)$")
_BULLET_RE = re.compile(r"^[-*]\s+(.*)$")
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def _safe_color(value: Any) -> str | None:
    """`#RGB`/`#RRGGBB` → та же строка (валидный CSS-цвет); иначе None."""
    if not isinstance(value, str):
        return None
    v = value.strip()
    return v if _HEX_RE.match(v) else None


def _safe_font(value: Any) -> str | None:
    """Оставить только безопасные для CSS символы шрифта; пусто → None."""
    if not isinstance(value, str):
        return None
    cleaned = re.sub(r"[^A-Za-z0-9 _-]", "", value).strip()
    return cleaned or None


def _inline_html(text: str) -> str:
    """Экранировать текст и превратить `**...**` в `<strong>` (без raw HTML)."""
    parts: list[str] = []
    last = 0
    for m in _BOLD_RE.finditer(text):
        if m.start() > last:
            parts.append(html.escape(text[last : m.start()]))
        parts.append("<strong>" + html.escape(m.group(1)) + "</strong>")
        last = m.end()
    if last < len(text):
        parts.append(html.escape(text[last:]))
    return "".join(parts)


def _markdown_to_html(markdown: str) -> str:
    """MVP-subset markdown → безопасный HTML (всё экранировано)."""
    blocks: list[str] = []
    items: list[str] = []

    def flush_list() -> None:
        if items:
            lis = "".join(f"<li>{_inline_html(i)}</li>" for i in items)
            blocks.append(f"<ul>{lis}</ul>")
            items.clear()

    for raw in (markdown or "").replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if not line:
            flush_list()
            continue
        heading = _HEADING_RE.match(line)
        if heading:
            flush_list()
            level = len(heading.group(1))
            blocks.append(f"<h{level}>{_inline_html(heading.group(2).strip())}</h{level}>")
            continue
        bullet = _BULLET_RE.match(line)
        if bullet:
            items.append(bullet.group(1).strip())
            continue
        flush_list()
        blocks.append(f"<p>{_inline_html(line)}</p>")
    flush_list()
    return "\n".join(blocks)


def _logo_data_uri(logo_bytes: bytes | None) -> str | None:
    """Готовые PNG/JPEG-байты → data URI; пусто → None. Без сети."""
    if not logo_bytes:
        return None
    mime = "image/png" if logo_bytes.startswith(_PNG_MAGIC) else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(logo_bytes).decode()}"


def _render_html(
    *,
    body_html: str,
    title: str | None,
    brand_name: str | None,
    document_label: str | None,
    date_text: str | None,
    logo_data_uri: str | None,
    accent: str | None,
    font: str | None,
) -> str:
    """Собрать самодостаточный HTML-документ (inline CSS, без внешних ресурсов)."""
    heading_color = accent or "#1a1a1a"
    divider_color = accent or "#cccccc"
    font_prefix = f'"{font}", ' if font else ""
    font_stack = font_prefix + "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

    header_parts: list[str] = []
    if logo_data_uri:
        header_parts.append(f'<img class="logo" src="{logo_data_uri}" alt="logo">')
    if brand_name:
        header_parts.append(f'<div class="brand">{html.escape(brand_name)}</div>')
    meta = " · ".join(part for part in (document_label, date_text) if part)
    if meta:
        header_parts.append(f'<div class="meta">{html.escape(meta)}</div>')
    header_html = ("".join(header_parts) + '<hr class="divider">') if header_parts else ""

    return f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>{html.escape(title or "Бриф")}</title>
<style>
body {{ font-family: {font_stack}; color: #222; font-size: 12pt; line-height: 1.55; }}
.logo {{ max-height: 56px; max-width: 220px; margin-bottom: 8px; }}
.brand {{ font-weight: 700; font-size: 15pt; color: {heading_color}; margin: 0 0 2px; }}
.meta {{ font-size: 9pt; color: #888888; margin: 0; }}
.divider {{ border: 0; border-top: 2px solid {divider_color}; margin: 8px 0 18px; }}
h1 {{ font-size: 20pt; color: {heading_color}; margin: 14px 0 8px; }}
h2 {{ font-size: 12pt; text-transform: uppercase; letter-spacing: 0.04em; color: {heading_color}; margin: 16px 0 6px; }}
h3 {{ font-size: 13pt; margin: 12px 0 6px; }}
p {{ margin: 0 0 8px; }}
ul {{ margin: 4px 0 10px; padding-left: 20px; }}
li {{ margin: 3px 0; }}
strong {{ font-weight: 700; }}
</style></head><body>
{header_html}
{body_html}
</body></html>"""


def _html_to_pdf(html_doc: str) -> bytes:
    """Отрендерить HTML в PDF через headless Chromium с заблокированной сетью."""
    from playwright.sync_api import sync_playwright

    def _block(route):
        # data:/about: пропускаем (инлайн-логотип), внешние запросы режем
        if route.request.url.startswith(("data:", "about:")):
            route.continue_()
        else:
            route.abort()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox"])
        try:
            context = browser.new_context()
            context.route("**/*", _block)
            page = context.new_page()
            page.set_content(html_doc, wait_until="load")
            return page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "16mm", "bottom": "16mm", "left": "14mm", "right": "14mm"},
            )
        finally:
            browser.close()


def build_pdf(
    markdown: str,
    *,
    title: str | None = None,
    identity: dict[str, Any] | None = None,
    brand_name: str | None = None,
    document_label: str | None = None,
    date_text: str | None = None,
    logo_bytes: bytes | None = None,
) -> bytes:
    """Собрать брендированный PDF (bytes) из markdown через Chromium.

    `identity` (font_family + accent/primary color), `brand_name`,
    `document_label`, `date_text`, `logo_bytes` формируют letterhead — как в
    DOCX. Пустая/невалидная identity или отсутствие логотипа → аккуратный
    fallback (дефолтные цвета, без хедера/лого). Весь текст экранируется,
    логотип идёт data URI, браузеру запрещены внешние запросы.
    """
    identity = identity or {}
    accent = _safe_color(identity.get("accent_color")) or _safe_color(
        identity.get("primary_color")
    )
    font = _safe_font(identity.get("font_family"))

    html_doc = _render_html(
        body_html=_markdown_to_html(markdown),
        title=title,
        brand_name=brand_name,
        document_label=document_label,
        date_text=date_text,
        logo_data_uri=_logo_data_uri(logo_bytes),
        accent=accent,
        font=font,
    )
    return _html_to_pdf(html_doc)
