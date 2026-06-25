"""Лёгкий конвертер Markdown → DOCX для экспорта сгенерированного брифа.

Покрывает подмножество markdown, которое выдают generate-промпты и рендерит
фронтовый MarkdownView: `#`/`##`/`###` заголовки, списки `- `/`* `, инлайн
`**bold**`, обычные параграфы. Таблицы не парсятся (генератор их не выдаёт).
Чистый модуль — без БД/HTTP.
"""

import io
import re
from typing import Any

from docx import Document
from docx.shared import RGBColor

_HEADING_RE = re.compile(r"^(#{1,3})\s+(.*)$")
_BULLET_RE = re.compile(r"^[-*]\s+(.*)$")
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
_HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def _parse_hex(value: Any) -> RGBColor | None:
    """`#RGB` / `#RRGGBB` → RGBColor; всё прочее (None/пусто/мусор) → None."""
    if not isinstance(value, str):
        return None
    v = value.strip()
    if not _HEX_RE.match(v):
        return None
    h = v[1:]
    if len(h) == 3:  # #RGB → #RRGGBB
        h = "".join(c * 2 for c in h)
    try:
        return RGBColor.from_string(h.upper())
    except ValueError:
        return None


def _add_inline(paragraph, text: str) -> None:
    """Добавить текст в параграф, превращая `**...**` в жирные run-ы."""
    last = 0
    for m in _BOLD_RE.finditer(text):
        if m.start() > last:
            paragraph.add_run(text[last : m.start()])
        paragraph.add_run(m.group(1)).bold = True
        last = m.end()
    if last < len(text):
        paragraph.add_run(text[last:])


def _style_runs(
    paragraph, *, font: str | None = None, color: RGBColor | None = None
) -> None:
    """Применить бренд-шрифт/цвет к run-ам параграфа (если заданы)."""
    for run in paragraph.runs:
        if font:
            run.font.name = font
        if color is not None:
            run.font.color.rgb = color


def build_docx(
    markdown: str,
    *,
    title: str | None = None,
    identity: dict[str, Any] | None = None,
) -> bytes:
    """Собрать .docx (bytes) из markdown.

    `title` пишется в core-properties документа, но НЕ дублируется в теле —
    markdown обычно уже начинается с `# {title}`.

    `identity` — опциональный brand_identity_json. Применяются только
    `font_family` (шрифт документа) и `accent_color`/`primary_color` (цвет
    заголовков). Пустая/невалидная identity (`None`/`{}`/битый hex) → DOCX
    идентичен прежнему. Логотип не используется.
    """
    identity = identity or {}
    raw_font = identity.get("font_family")
    font = raw_font.strip() if isinstance(raw_font, str) and raw_font.strip() else None
    heading_color = _parse_hex(identity.get("accent_color")) or _parse_hex(
        identity.get("primary_color")
    )

    document = Document()
    if title:
        document.core_properties.title = title
    if font:
        document.styles["Normal"].font.name = font

    for raw in (markdown or "").replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if not line:
            continue
        heading = _HEADING_RE.match(line)
        if heading:
            level = len(heading.group(1))
            paragraph = document.add_paragraph(style=f"Heading {level}")
            _add_inline(paragraph, heading.group(2).strip())
            _style_runs(paragraph, font=font, color=heading_color)
            continue
        bullet = _BULLET_RE.match(line)
        if bullet:
            paragraph = document.add_paragraph(style="List Bullet")
            _add_inline(paragraph, bullet.group(1).strip())
            _style_runs(paragraph, font=font)
            continue
        paragraph = document.add_paragraph()
        _add_inline(paragraph, line)
        _style_runs(paragraph, font=font)

    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()
