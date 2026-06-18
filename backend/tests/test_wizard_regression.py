"""Regression: the original wizard flow is unaffected by brand-aware additions.

A plain wizard brief is created with a default context_json and stays a
wizard brief — none of the freeform fields get populated.
"""

import pytest

pytestmark = pytest.mark.db


def test_wizard_brief_creates_with_default_context(client):
    resp = client.post("/api/briefs", json={"title": "Wizard brief"})
    assert resp.status_code == 201, resp.text
    body = resp.json()

    assert body["title"] == "Wizard brief"
    assert body["status"] == "draft"
    # default 22-field context is present
    assert body["context_json"]["task_type"] == ""
    assert "key_messages" in body["context_json"]

    # not a freeform brief
    assert body["brand_id"] is None
    assert body["raw_input_text"] is None
    assert body["structured_brief_json"] is None
    assert body["is_input_summary_verified"] is False


def test_wizard_context_patch_persists(client):
    brief_id = client.post("/api/briefs", json={"title": "W"}).json()["id"]

    patched = client.patch(
        f"/api/briefs/{brief_id}/context", json={"task_type": "video", "kpi": ["reach"]}
    )
    assert patched.status_code == 200

    got = client.get(f"/api/briefs/{brief_id}").json()
    assert got["context_json"]["task_type"] == "video"
    assert got["context_json"]["kpi"] == ["reach"]
    # still a wizard brief
    assert got["brand_id"] is None
    assert got["structured_brief_json"] is None


def test_wizard_brief_not_in_brand_does_not_become_freeform(client):
    """Creating a freeform brief for a brand must not touch existing wizard briefs."""
    wizard_id = client.post("/api/briefs", json={"title": "Wizard"}).json()["id"]

    brand_id = client.post("/api/brands", json={"name": "B"}).json()["id"]
    client.post("/api/briefs/freeform", json={"brand_id": brand_id})

    still_wizard = client.get(f"/api/briefs/{wizard_id}").json()
    assert still_wizard["brand_id"] is None
    assert still_wizard["structured_brief_json"] is None
