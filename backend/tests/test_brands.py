"""Brand CRUD and brand→brief cascade (ON DELETE SET NULL)."""

import pytest

pytestmark = pytest.mark.db


def _create_brand(client, name="Test Brand"):
    resp = client.post(
        "/api/brands",
        json={"name": name, "description": "desc", "brand_context_json": {"tone": "bold"}},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_brand_crud(client):
    created = _create_brand(client)
    brand_id = created["id"]
    assert created["name"] == "Test Brand"
    assert created["brand_context_json"] == {"tone": "bold"}

    # list
    listed = client.get("/api/brands")
    assert listed.status_code == 200
    assert any(b["id"] == brand_id for b in listed.json())

    # get one
    got = client.get(f"/api/brands/{brand_id}")
    assert got.status_code == 200
    assert got.json()["id"] == brand_id

    # update
    patched = client.patch(f"/api/brands/{brand_id}", json={"name": "Renamed"})
    assert patched.status_code == 200
    assert patched.json()["name"] == "Renamed"

    # delete
    assert client.delete(f"/api/brands/{brand_id}").status_code == 204
    assert client.get(f"/api/brands/{brand_id}").status_code == 404


def test_get_missing_brand_404(client):
    assert client.get("/api/brands/999999").status_code == 404


def test_delete_brand_nulls_brief_brand_id(client):
    """Deleting a brand must null brand_id on its briefs (ON DELETE SET NULL)."""
    brand_id = _create_brand(client)["id"]

    created = client.post("/api/briefs/freeform", json={"brand_id": brand_id})
    assert created.status_code == 201, created.text
    brief = created.json()
    brief_id = brief["id"]
    assert brief["brand_id"] == brand_id

    assert client.delete(f"/api/brands/{brand_id}").status_code == 204

    after = client.get(f"/api/briefs/{brief_id}")
    assert after.status_code == 200
    assert after.json()["brand_id"] is None
