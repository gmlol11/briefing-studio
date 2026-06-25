"""DOCX export — build_docx unit + /export/docx endpoint (wizard & freeform)."""

import io

import pytest
from docx import Document

from app.services.docx_export import build_docx

DOCX_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MD = "# Бриф\n\n## Цель\n\n- первый **пункт**\n\nфинальный абзац"


# --- unit (no DB) ---------------------------------------------------------


def test_build_docx_returns_valid_docx():
    data = build_docx(MD, title="Тестовый бриф")
    assert data[:4] == b"PK\x03\x04"  # zip/docx signature

    doc = Document(io.BytesIO(data))
    styles = [p.style.name for p in doc.paragraphs]
    assert "Heading 1" in styles
    assert "Heading 2" in styles
    assert "List Bullet" in styles
    # инлайн **bold** → жирный run
    assert any(run.bold for p in doc.paragraphs for run in p.runs)
    # title попал в core-properties, но не задублирован в тело
    assert doc.core_properties.title == "Тестовый бриф"


def test_build_docx_empty_is_still_valid():
    data = build_docx("")
    assert data[:4] == b"PK\x03\x04"
    Document(io.BytesIO(data))  # открывается без ошибок


def _first_heading_color(doc):
    for p in doc.paragraphs:
        if p.style.name.startswith("Heading") and p.runs:
            return p.runs[0].font.color.rgb
    return None


def test_build_docx_with_identity_applies_font_and_color():
    identity = {"font_family": "Georgia", "accent_color": "#1f6feb"}
    doc = Document(io.BytesIO(build_docx(MD, title="t", identity=identity)))
    assert doc.styles["Normal"].font.name == "Georgia"
    # цвет акцента ушёл в заголовки
    assert str(_first_heading_color(doc)) == "1F6FEB"


def test_build_docx_identity_color_falls_back_to_primary():
    identity = {"primary_color": "#abc"}  # #RGB → #RRGGBB, accent отсутствует
    doc = Document(io.BytesIO(build_docx(MD, identity=identity)))
    assert str(_first_heading_color(doc)) == "AABBCC"


@pytest.mark.parametrize(
    "identity",
    [
        None,
        {},
        {"font_family": "", "primary_color": "", "accent_color": None},
        {"primary_color": "not-a-color", "accent_color": "#xyz"},
    ],
)
def test_build_docx_empty_or_invalid_identity_does_not_break(identity):
    data = build_docx(MD, title="t", identity=identity)
    assert data[:4] == b"PK\x03\x04"
    doc = Document(io.BytesIO(data))
    # битый/пустой цвет → заголовки без явного цвета (как раньше)
    assert _first_heading_color(doc) is None


# --- endpoint (DB) --------------------------------------------------------


def _generated_wizard(db_session):
    from app.models import Brief

    brief = Brief(title="W docx", generated_markdown=MD, status="generated")
    db_session.add(brief)
    db_session.commit()
    return brief.id


def _generated_freeform(db_session, identity=None):
    from app.models import Brand, Brief

    brand = Brand(name="B", brand_identity_json=identity or {})
    db_session.add(brand)
    db_session.flush()
    brief = Brief(
        title="F docx", brand_id=brand.id, generated_markdown=MD, status="generated"
    )
    db_session.add(brief)
    db_session.commit()
    return brief.id


@pytest.mark.db
def test_export_docx_409_when_not_generated(client):
    brief_id = client.post("/api/briefs", json={"title": "x"}).json()["id"]
    assert client.get(f"/api/briefs/{brief_id}/export/docx").status_code == 409


@pytest.mark.db
def test_export_docx_wizard(client, db_session):
    brief_id = _generated_wizard(db_session)
    resp = client.get(f"/api/briefs/{brief_id}/export/docx")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == DOCX_CT
    assert resp.headers["content-disposition"] == (
        f'attachment; filename="brief-{brief_id}.docx"'
    )
    assert resp.content[:4] == b"PK\x03\x04"
    Document(io.BytesIO(resp.content))  # валидный docx


@pytest.mark.db
def test_export_docx_freeform(client, db_session):
    brief_id = _generated_freeform(db_session)
    resp = client.get(f"/api/briefs/{brief_id}/export/docx")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == DOCX_CT
    assert resp.content[:4] == b"PK\x03\x04"


@pytest.mark.db
def test_export_docx_freeform_with_identity(client, db_session):
    brief_id = _generated_freeform(
        db_session, identity={"font_family": "Georgia", "accent_color": "#1f6feb"}
    )
    resp = client.get(f"/api/briefs/{brief_id}/export/docx")
    assert resp.status_code == 200
    assert resp.content[:4] == b"PK\x03\x04"
    doc = Document(io.BytesIO(resp.content))
    assert doc.styles["Normal"].font.name == "Georgia"


@pytest.mark.db
def test_markdown_and_json_export_regression(client, db_session):
    brief_id = _generated_wizard(db_session)
    md = client.get(f"/api/briefs/{brief_id}/export/markdown")
    assert md.status_code == 200 and md.headers["content-type"].startswith("text/markdown")
    js = client.get(f"/api/briefs/{brief_id}/export/json")
    assert js.status_code == 200 and js.headers["content-type"].startswith("application/json")
