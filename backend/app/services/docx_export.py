"""Лёгкий конвертер Markdown → DOCX для экспорта сгенерированного брифа.

Покрывает подмножество markdown, которое выдают generate-промпты и рендерит
фронтовый MarkdownView: `#`/`##`/`###` заголовки, списки `- `/`* `, инлайн
`**bold**`, обычные параграфы. Таблицы не парсятся (генератор их не выдаёт).
Чистый модуль — без БД/HTTP.
"""

import io
import re

from docx import Document

_HEADING_RE = re.compile(r"^(#{1,3})\s+(.*)$")
_BULLET_RE = re.compile(r"^[-*]\s+(.*)$")
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")


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


def build_docx(markdown: str, *, title: str | None = None) -> bytes:
    """Собрать .docx (bytes) из markdown.

    `title` пишется в core-properties документа, но НЕ дублируется в теле —
    markdown обычно уже начинается с `# {title}`.
    """
    document = Document()
    if title:
        document.core_properties.title = title

    for raw in (markdown or "").replace("\r\n", "\n").split("\n"):
        line = raw.strip()
        if not line:
            continue
        heading = _HEADING_RE.match(line)
        if heading:
            level = len(heading.group(1))
            paragraph = document.add_paragraph(style=f"Heading {level}")
            _add_inline(paragraph, heading.group(2).strip())
            continue
        bullet = _BULLET_RE.match(line)
        if bullet:
            paragraph = document.add_paragraph(style="List Bullet")
            _add_inline(paragraph, bullet.group(1).strip())
            continue
        _add_inline(document.add_paragraph(), line)

    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()
