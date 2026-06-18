"""Template layer endpoints — commit #2 scope.

LLM is mocked via FakeLLM injected through brand_brief_service.get_llm_service,
so the real BriefTemplate Pydantic validation path is exercised. No network/key.
"""

import fakes
import pytest

pytestmark = pytest.mark.db

VALID_TEMPLATE = {
    "name": "Структура из референса клиента",
    "source": "reference",
    "sections": [
        {
            "key": "goal",
            "title": "Главная цель",
            "description": "",
            "selected": True,
            "fields": [
                {"key": "main_goal", "label": "Цель", "selected": True,
                 "required": True, "hint": ""}
            ],
        },
        {
            "key": "channels",
            "title": "Каналы",
            "description": "",
            "selected": True,
            "fields": [],
        },
    ],
}


def _brand(client, name="Brand"):
    resp = client.post("/api/brands", json={"name": name, "brand_context_json": {}})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_get_default_template(client):
    resp = client.get("/api/briefs/template/default")
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "default"
    assert body["sections"]
    required = {f["key"] for s in body["sections"] for f in s["fields"] if f["required"]}
    assert {"main_goal", "target_audience", "key_message"} <= required


def test_decompose_template_with_mock_llm(client, monkeypatch):
    from app.services import brand_brief_service as svc

    monkeypatch.setattr(
        svc, "get_llm_service", lambda: fakes.FakeLLM(json_response=VALID_TEMPLATE)
    )
    resp = client.post(
        "/api/briefs/template/decompose", json={"reference_text": "Цель: ...\nКаналы: ..."}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["source"] == "reference"
    assert len(body["sections"]) == 2
    assert body["sections"][0]["fields"][0]["key"] == "main_goal"


def test_decompose_template_with_brand_context(client, monkeypatch):
    from app.services import brand_brief_service as svc

    captured = {}

    class CapturingLLM:
        def chat_json(self, prompt, payload):
            captured["payload"] = payload
            return VALID_TEMPLATE

    monkeypatch.setattr(svc, "get_llm_service", lambda: CapturingLLM())
    brand_id = _brand(client)
    resp = client.post(
        "/api/briefs/template/decompose",
        json={"reference_text": "ref", "brand_id": brand_id},
    )
    assert resp.status_code == 200
    # brand context was passed through to the LLM payload
    assert "brand_context_json" in captured["payload"]


def test_decompose_template_unknown_brand_404(client):
    resp = client.post(
        "/api/briefs/template/decompose",
        json={"reference_text": "ref", "brand_id": 999999},
    )
    assert resp.status_code == 404


def test_decompose_template_invalid_shape_502(client, monkeypatch):
    from app.services import brand_brief_service as svc

    monkeypatch.setattr(
        svc, "get_llm_service",
        lambda: fakes.FakeLLM(json_response={"sections": "not-a-list"}),
    )
    resp = client.post(
        "/api/briefs/template/decompose", json={"reference_text": "ref"}
    )
    assert resp.status_code == 502


def test_select_template_persists(client):
    brand_id = _brand(client)
    brief_id = client.post("/api/briefs/freeform", json={"brand_id": brand_id}).json()["id"]

    resp = client.post(
        f"/api/briefs/{brief_id}/select-template",
        json={"template": VALID_TEMPLATE, "reference_text": "исходный референс"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["selected_template_json"]["source"] == "reference"
    assert body["reference_template_text"] == "исходный референс"

    # round-trips through a fresh read
    again = client.get(f"/api/briefs/{brief_id}").json()
    assert again["selected_template_json"]["sections"][0]["key"] == "goal"


def test_select_template_unknown_brief_404(client):
    resp = client.post(
        "/api/briefs/999999/select-template", json={"template": VALID_TEMPLATE}
    )
    assert resp.status_code == 404


def test_other_freeform_brief_keeps_null_template(client):
    """Selecting a template on one brief must not affect another (regression)."""
    brand_id = _brand(client)
    a = client.post("/api/briefs/freeform", json={"brand_id": brand_id}).json()["id"]
    b = client.post("/api/briefs/freeform", json={"brand_id": brand_id}).json()["id"]

    client.post(f"/api/briefs/{a}/select-template", json={"template": VALID_TEMPLATE})

    other = client.get(f"/api/briefs/{b}").json()
    assert other["selected_template_json"] is None
    assert other["reference_template_text"] is None
