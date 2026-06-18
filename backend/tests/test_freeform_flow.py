"""Brand-aware freeform flow: happy path, order/critical gates, outdated, LLM errors.

LLM is mocked deterministically (see conftest.mock_llm + fakes); no network,
no API key. The router still re-validates structured output for real, so the
409 gate on critical fields exercises the actual gating logic.
"""

import fakes
import pytest

pytestmark = pytest.mark.db


def _brand(client):
    resp = client.post("/api/brands", json={"name": "Brand", "brand_context_json": {}})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _freeform_brief(client, brand_id):
    resp = client.post("/api/briefs/freeform", json={"brand_id": brand_id})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _run_full_flow(client, brief_id):
    """Drive input → summarize → verify → structure → clarifications → apply →
    generate-final. Returns the final brief payload."""
    assert (
        client.post(
            f"/api/briefs/{brief_id}/freeform-input",
            json={"raw_input_text": "Нужна кампания для нового энергетика."},
        ).status_code
        == 200
    )
    assert client.post(f"/api/briefs/{brief_id}/summarize-input").status_code == 200
    assert client.post(f"/api/briefs/{brief_id}/verify-input-summary").status_code == 200
    assert client.post(f"/api/briefs/{brief_id}/structure").status_code == 200
    assert client.post(f"/api/briefs/{brief_id}/clarifications").status_code == 200
    assert (
        client.post(
            f"/api/briefs/{brief_id}/apply-clarifications", json={"answers": []}
        ).status_code
        == 200
    )
    final = client.post(f"/api/briefs/{brief_id}/generate-final")
    assert final.status_code == 200, final.text
    return final.json()


def test_create_freeform_brief(client):
    brand_id = _brand(client)
    resp = client.post(
        "/api/briefs/freeform", json={"brand_id": brand_id, "title": "Кампания"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["brand_id"] == brand_id
    assert body["title"] == "Кампания"
    assert body["status"] == "draft"


def test_create_freeform_brief_unknown_brand_404(client):
    resp = client.post("/api/briefs/freeform", json={"brand_id": 999999})
    assert resp.status_code == 404


def test_full_freeform_flow_happy_path(client, mock_llm):
    brand_id = _brand(client)
    brief_id = _freeform_brief(client, brand_id)
    final = _run_full_flow(client, brief_id)

    assert final["status"] == "generated"
    assert final["generated_markdown"] == fakes.FINAL_MARKDOWN
    assert final["structured_brief_json"] == fakes.STRUCTURED_RESOLVED
    assert final["is_generated_outdated"] is False

    versions = client.get(f"/api/briefs/{brief_id}/versions")
    assert versions.status_code == 200
    payload = versions.json()
    assert len(payload) == 1
    assert payload[0]["version_number"] == 1


def test_order_gates_return_409(client, mock_llm):
    """Each step requires its predecessor; out-of-order calls give 409."""
    brand_id = _brand(client)
    brief_id = _freeform_brief(client, brand_id)

    # summarize before any freeform-input
    assert client.post(f"/api/briefs/{brief_id}/summarize-input").status_code == 409
    # structure before verifying the summary
    assert client.post(f"/api/briefs/{brief_id}/structure").status_code == 409
    # generate-final before structuring
    assert client.post(f"/api/briefs/{brief_id}/generate-final").status_code == 409


def test_generate_final_blocked_by_critical_field(client, mock_llm, monkeypatch):
    """structure yields a critical_missing field → generate-final must 409."""
    monkeypatch.setattr(mock_llm, "structure_brief", lambda brief: fakes.STRUCTURED_CRITICAL)
    brand_id = _brand(client)
    brief_id = _freeform_brief(client, brand_id)

    client.post(
        f"/api/briefs/{brief_id}/freeform-input",
        json={"raw_input_text": "Текст без бюджета."},
    )
    client.post(f"/api/briefs/{brief_id}/summarize-input")
    client.post(f"/api/briefs/{brief_id}/verify-input-summary")
    client.post(f"/api/briefs/{brief_id}/structure")

    blocked = client.post(f"/api/briefs/{brief_id}/generate-final")
    assert blocked.status_code == 409
    assert "budget" in blocked.json()["detail"]


def test_is_generated_outdated_reacts_to_structure_change(
    client, mock_llm, monkeypatch
):
    brand_id = _brand(client)
    brief_id = _freeform_brief(client, brand_id)
    _run_full_flow(client, brief_id)

    assert client.get(f"/api/briefs/{brief_id}").json()["is_generated_outdated"] is False

    # Change structured_brief_json after generation → hash diverges → outdated.
    monkeypatch.setattr(
        mock_llm,
        "apply_clarification_answers",
        lambda brief, answers: fakes.structured(fakes.field("goal", "другая цель")),
    )
    assert (
        client.post(
            f"/api/briefs/{brief_id}/apply-clarifications", json={"answers": []}
        ).status_code
        == 200
    )
    assert client.get(f"/api/briefs/{brief_id}").json()["is_generated_outdated"] is True


def test_invalid_llm_output_maps_to_502(client, monkeypatch):
    """brand_brief_service validates LLM JSON; bad shape → LLMError → 502.

    Uses FakeLLM via get_llm_service (not the service-function mock) to cover
    the real validation path.
    """
    from app.services import brand_brief_service as svc

    brand_id = _brand(client)
    brief_id = _freeform_brief(client, brand_id)
    client.post(
        f"/api/briefs/{brief_id}/freeform-input",
        json={"raw_input_text": "любой текст"},
    )

    # summary expects a string `summary`; an int fails Pydantic validation.
    monkeypatch.setattr(
        svc, "get_llm_service", lambda: fakes.FakeLLM(json_response={"summary": 123})
    )
    resp = client.post(f"/api/briefs/{brief_id}/summarize-input")
    assert resp.status_code == 502
