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


_FULL_IDENTITY = {
    "primary_color": "#FF6400",
    "secondary_color": "#FFE9DD",
    "accent_color": "#FF6400",
    "logo_url": "https://example.com/logo.png",
    "font_family": "Inter",
    "document_style": "clean_premium",
    "brand_notes": "Premium, warm tone",
}


def test_create_brand_without_identity_is_empty(client):
    """Бренд без переданной айдентики → пустая (все поля null)."""
    created = _create_brand(client)
    identity = created["brand_identity_json"]
    assert set(identity) == set(_FULL_IDENTITY)
    assert all(v is None for v in identity.values())


def test_create_brand_with_identity_roundtrips(client):
    resp = client.post(
        "/api/brands",
        json={"name": "Branded", "brand_identity_json": _FULL_IDENTITY},
    )
    assert resp.status_code == 201, resp.text
    brand_id = resp.json()["id"]
    assert resp.json()["brand_identity_json"] == _FULL_IDENTITY

    # читается обратно тем же
    got = client.get(f"/api/brands/{brand_id}")
    assert got.status_code == 200
    assert got.json()["brand_identity_json"] == _FULL_IDENTITY


def test_update_brand_identity(client):
    brand_id = _create_brand(client)["id"]
    patched = client.patch(
        f"/api/brands/{brand_id}",
        json={"brand_identity_json": {"primary_color": "#000000"}},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["brand_identity_json"]["primary_color"] == "#000000"


def test_update_other_fields_preserves_identity(client):
    created = client.post(
        "/api/brands",
        json={"name": "Keep", "brand_identity_json": _FULL_IDENTITY},
    ).json()
    brand_id = created["id"]

    # PATCH без brand_identity_json не должен затирать айдентику
    patched = client.patch(f"/api/brands/{brand_id}", json={"name": "Renamed"})
    assert patched.status_code == 200, patched.text
    assert patched.json()["name"] == "Renamed"
    assert patched.json()["brand_identity_json"] == _FULL_IDENTITY


def test_create_brand_invalid_hex_rejected(client):
    resp = client.post(
        "/api/brands",
        json={"name": "Bad", "brand_identity_json": {"primary_color": "red"}},
    )
    assert resp.status_code == 422, resp.text


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
