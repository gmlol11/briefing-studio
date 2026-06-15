"""No-DB smoke tests: app loads and exposes the expected API surface."""


def test_app_imports():
    import app.main as m
    from fastapi import FastAPI

    assert isinstance(m.app, FastAPI)


def test_openapi_includes_core_paths():
    import app.main as m

    paths = m.app.openapi()["paths"]
    assert "/health" in paths
    assert "/api/briefs" in paths
    assert any(p.startswith("/api/briefs/") for p in paths)
