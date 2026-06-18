"""Shared test setup.

Two tiers of tests live here:

* no-DB smoke (``test_app``, ``test_context``) — run anywhere, no Postgres.
* DB integration (marked ``db``) — brand-aware flow against a real Postgres
  test database given via ``TEST_DATABASE_URL``.

SQLite is intentionally not used: the models rely on PostgreSQL JSONB and
``ON DELETE SET NULL`` / ``CASCADE`` foreign keys.
"""

import os
import pathlib
import sys

import pytest

# Make the backend root (parent of tests/) importable as the `app` package,
# and tests/ importable for `import fakes`, regardless of working directory.
_TESTS_DIR = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(_TESTS_DIR.parent))
sys.path.insert(0, str(_TESTS_DIR))

# Tables truncated between DB tests (children first for clarity; CASCADE covers FKs).
_TABLES = ("brief_versions", "brand_sources", "briefs", "brands")


def _test_database_url() -> str | None:
    return os.environ.get("TEST_DATABASE_URL")


def pytest_collection_modifyitems(config, items):
    """Skip ``db``-marked tests when no TEST_DATABASE_URL is configured."""
    if _test_database_url():
        return
    skip = pytest.mark.skip(
        reason="TEST_DATABASE_URL not set — DB integration tests skipped "
        "(see backend/README/test docs to set up a Postgres test DB)."
    )
    for item in items:
        if "db" in item.keywords:
            item.add_marker(skip)


def _guarded_test_url() -> str:
    """Return TEST_DATABASE_URL after refusing unsafe values.

    Fails loudly if it equals the dev DATABASE_URL or if the database name
    does not contain ``test`` — so the dev database can never be touched.
    """
    from sqlalchemy.engine import make_url

    from app.config import get_settings

    test_url = os.environ["TEST_DATABASE_URL"]
    dev_url = get_settings().database_url
    if test_url == dev_url:
        pytest.exit(
            "TEST_DATABASE_URL must differ from DATABASE_URL — refusing to run "
            "tests against the dev database.",
            returncode=1,
        )
    db_name = make_url(test_url).database or ""
    if "test" not in db_name.lower():
        pytest.exit(
            f"TEST_DATABASE_URL database name must contain 'test' (got {db_name!r}) "
            "— refusing to run tests against a non-test database.",
            returncode=1,
        )
    return test_url


def _truncate(engine) -> None:
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(
            text(f"TRUNCATE {', '.join(_TABLES)} RESTART IDENTITY CASCADE")
        )


@pytest.fixture(scope="session")
def test_engine():
    """Session-wide engine on the test DB; schema created from the models."""
    from sqlalchemy import create_engine

    import app.models  # noqa: F401 — register all tables on Base.metadata
    from app.db import Base

    engine = create_engine(_guarded_test_url(), pool_pre_ping=True)
    Base.metadata.create_all(engine)
    try:
        yield engine
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture(scope="session")
def test_sessionmaker(test_engine):
    from sqlalchemy.orm import sessionmaker

    return sessionmaker(bind=test_engine, autocommit=False, autoflush=False)


@pytest.fixture
def _clean_db(test_engine):
    """Truncate all tables around each DB test for full isolation."""
    _truncate(test_engine)
    yield
    _truncate(test_engine)


@pytest.fixture
def db_session(test_sessionmaker, _clean_db):
    """A session for direct DB arrange/assert in tests."""
    session = test_sessionmaker()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(test_sessionmaker, _clean_db):
    """TestClient with get_db overridden to the test session factory."""
    from fastapi.testclient import TestClient

    from app.db import get_db
    from app.main import app

    def _override_get_db():
        db = test_sessionmaker()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    try:
        with TestClient(app) as c:
            yield c
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def mock_llm(monkeypatch):
    """Patch brand_brief_service LLM ops with deterministic happy-path output.

    Returns the patched module so individual tests can override a single op
    (e.g. force a critical_missing structure) via monkeypatch.
    """
    import fakes

    from app.services import brand_brief_service as svc

    monkeypatch.setattr(svc, "summarize_input", lambda brief: fakes.INPUT_SUMMARY)
    monkeypatch.setattr(svc, "structure_brief", lambda brief: fakes.STRUCTURED_OK)
    monkeypatch.setattr(
        svc, "generate_clarifications", lambda brief: fakes.CLARIFICATIONS
    )
    monkeypatch.setattr(
        svc,
        "apply_clarification_answers",
        lambda brief, answers: fakes.STRUCTURED_RESOLVED,
    )
    monkeypatch.setattr(
        svc, "generate_final_brief", lambda brief: fakes.FINAL_MARKDOWN
    )
    return svc
