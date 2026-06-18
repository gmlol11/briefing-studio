"""Template-aware freeform generation — commit #3 scope.

Covers: template reaches the LLM payload, template-driven 409 gate, hash/snapshot
include structured+template, outdated flips on template change, and the no-template
fallback keeps the prior behaviour. LLM mocked (no network/key).
"""

import fakes
import pytest

from app.models import Brief
from app.utils import context_hash

pytestmark = pytest.mark.db

TEMPLATE = {
    "name": "Шаблон из референса",
    "source": "reference",
    "sections": [
        {
            "key": "goal",
            "title": "Цель",
            "description": "",
            "selected": True,
            "fields": [
                {"key": "main_goal", "label": "Цель", "selected": True,
                 "required": True, "hint": ""}
            ],
        }
    ],
}


class RecordingLLM:
    """Spy LLM: records payloads, returns canned content."""

    def __init__(self, json_response=None, markdown_response="# md"):
        self.json_response = json_response
        self.markdown_response = markdown_response
        self.json_payloads: list[dict] = []
        self.markdown_payloads: list[dict] = []

    def chat_json(self, prompt, payload):
        self.json_payloads.append(payload)
        return self.json_response

    def chat_markdown(self, prompt, payload):
        self.markdown_payloads.append(payload)
        return self.markdown_response


def _brand(client):
    return client.post("/api/brands", json={"name": "B", "brand_context_json": {}}).json()["id"]


def _freeform(client, brand_id):
    return client.post("/api/briefs/freeform", json={"brand_id": brand_id}).json()["id"]


def _mark_ready(db_session, brief_id, *, structured, template=None):
    """Bring a brief to a 'verified summary + structured' state without LLM."""
    brief = db_session.get(Brief, brief_id)
    brief.raw_input_text = "txt"
    brief.input_summary_json = {"summary": "s"}
    brief.is_input_summary_verified = True
    brief.structured_brief_json = structured
    if template is not None:
        brief.selected_template_json = template
    db_session.commit()


def test_structure_receives_template_in_payload(client, db_session, monkeypatch):
    from app.services import brand_brief_service as svc

    brand_id = _brand(client)
    brief_id = _freeform(client, brand_id)
    client.post(f"/api/briefs/{brief_id}/select-template", json={"template": TEMPLATE})
    client.post(f"/api/briefs/{brief_id}/freeform-input", json={"raw_input_text": "txt"})
    brief = db_session.get(Brief, brief_id)
    brief.input_summary_json = {"summary": "s"}
    brief.is_input_summary_verified = True
    db_session.commit()

    rec = RecordingLLM(json_response=fakes.structured(fakes.field("main_goal", "узнаваемость")))
    monkeypatch.setattr(svc, "get_llm_service", lambda: rec)

    resp = client.post(f"/api/briefs/{brief_id}/structure")
    assert resp.status_code == 200
    assert rec.json_payloads, "structure should call the LLM"
    assert rec.json_payloads[-1]["selected_template_json"]["source"] == "reference"
    assert resp.json()["structured_brief_json"]["fields"][0]["key"] == "main_goal"


def test_structure_without_template_sends_null_payload(client, db_session, monkeypatch):
    from app.services import brand_brief_service as svc

    brand_id = _brand(client)
    brief_id = _freeform(client, brand_id)
    client.post(f"/api/briefs/{brief_id}/freeform-input", json={"raw_input_text": "txt"})
    brief = db_session.get(Brief, brief_id)
    brief.input_summary_json = {"summary": "s"}
    brief.is_input_summary_verified = True
    db_session.commit()

    rec = RecordingLLM(json_response=fakes.STRUCTURED_OK)
    monkeypatch.setattr(svc, "get_llm_service", lambda: rec)

    resp = client.post(f"/api/briefs/{brief_id}/structure")
    assert resp.status_code == 200
    assert rec.json_payloads[-1]["selected_template_json"] is None  # explicit fallback


def test_required_template_field_missing_blocks_generate_final(client, db_session):
    brand_id = _brand(client)
    brief_id = _freeform(client, brand_id)
    critical = fakes.structured(
        fakes.field("main_goal", "", status="critical_missing", confidence=0.0)
    )
    _mark_ready(db_session, brief_id, structured=critical, template=TEMPLATE)

    resp = client.post(f"/api/briefs/{brief_id}/generate-final")
    assert resp.status_code == 409
    assert "main_goal" in resp.json()["detail"]


def test_generate_final_with_template_hash_snapshot_meta(client, db_session, monkeypatch):
    from app.services import brand_brief_service as svc

    monkeypatch.setattr(svc, "generate_final_brief", lambda brief: "# md")
    brand_id = _brand(client)
    brief_id = _freeform(client, brand_id)
    _mark_ready(db_session, brief_id, structured=fakes.STRUCTURED_OK, template=TEMPLATE)

    body = client.post(f"/api/briefs/{brief_id}/generate-final").json()
    assert body["status"] == "generated"
    assert body["is_generated_outdated"] is False

    expected = context_hash(
        {"structured": body["structured_brief_json"], "template": body["selected_template_json"]}
    )
    assert body["generated_from_context_hash"] == expected

    version = client.get(f"/api/briefs/{brief_id}/versions").json()[0]
    snap = version["context_snapshot_json"]
    assert set(snap.keys()) == {"structured", "template"}
    assert snap["template"]["source"] == "reference"
    assert version["generation_meta_json"]["template_source"] == "reference"


def test_template_change_after_generation_marks_outdated(client, db_session, monkeypatch):
    from app.services import brand_brief_service as svc

    monkeypatch.setattr(svc, "generate_final_brief", lambda brief: "# md")
    brand_id = _brand(client)
    brief_id = _freeform(client, brand_id)
    _mark_ready(db_session, brief_id, structured=fakes.STRUCTURED_OK, template=TEMPLATE)

    client.post(f"/api/briefs/{brief_id}/generate-final")
    assert client.get(f"/api/briefs/{brief_id}").json()["is_generated_outdated"] is False

    client.post(
        f"/api/briefs/{brief_id}/select-template",
        json={"template": {"name": "changed", "source": "custom", "sections": []}},
    )
    assert client.get(f"/api/briefs/{brief_id}").json()["is_generated_outdated"] is True


def test_generate_final_without_template_fallback(client, db_session, monkeypatch):
    from app.services import brand_brief_service as svc

    monkeypatch.setattr(svc, "generate_final_brief", lambda brief: "# md")
    brand_id = _brand(client)
    brief_id = _freeform(client, brand_id)
    _mark_ready(db_session, brief_id, structured=fakes.STRUCTURED_OK)  # no template

    body = client.post(f"/api/briefs/{brief_id}/generate-final").json()
    assert body["selected_template_json"] is None
    assert body["is_generated_outdated"] is False
    # hash from structured only (prior behaviour)
    assert body["generated_from_context_hash"] == context_hash(body["structured_brief_json"])

    version = client.get(f"/api/briefs/{brief_id}/versions").json()[0]
    snap = version["context_snapshot_json"]
    assert "fields" in snap and "structured" not in snap  # compatible legacy snapshot
    assert "template_source" not in version["generation_meta_json"]
