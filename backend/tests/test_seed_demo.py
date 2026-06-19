"""Idempotency of the dev/demo seed script (scripts/seed_demo.py).

Runs the seed against the test DB (via the conftest db_session), asserts the
demo entities exist, then re-runs and asserts nothing duplicates. Also checks
that --reset keeps counts stable.
"""

import seed_demo
import pytest

pytestmark = pytest.mark.db

EXPECTED = {"brands": 1, "briefs": 4, "versions": 2, "sources": 1}


def test_seed_creates_expected_demo_entities(db_session):
    counts = seed_demo.seed(db_session)
    assert counts == EXPECTED


def test_seed_is_idempotent(db_session):
    first = seed_demo.seed(db_session)
    second = seed_demo.seed(db_session)
    assert first == EXPECTED
    assert second == EXPECTED  # re-run does not grow demo data


def test_seed_reset_keeps_counts_stable(db_session):
    seed_demo.seed(db_session)
    after_reset = seed_demo.seed(db_session, reset=True)
    assert after_reset == EXPECTED


def test_pre_generated_briefs_have_versions_and_consistent_hash(db_session):
    from app.models import Brief
    from app.utils import context_hash

    seed_demo.seed(db_session)

    wizard = db_session.query(Brief).filter_by(
        title=seed_demo.WIZARD_GENERATED_TITLE
    ).one()
    assert wizard.generated_markdown
    assert len(wizard.versions) == 1
    # hash matches its source → not outdated
    assert wizard.generated_from_context_hash == context_hash(wizard.context_json)
    assert wizard.is_generated_outdated is False

    freeform = db_session.query(Brief).filter_by(
        title=seed_demo.FREEFORM_GENERATED_TITLE
    ).one()
    assert freeform.brand_id is not None
    assert len(freeform.versions) == 1
    # template-aware freeform hashes structured + template → not outdated
    assert freeform.generated_from_context_hash == context_hash(
        freeform.generated_hash_source()
    )
    assert freeform.is_generated_outdated is False


def test_freeform_demo_briefs_have_templates(db_session):
    from app.models import Brief

    seed_demo.seed(db_session)

    review = db_session.query(Brief).filter_by(
        title=seed_demo.FREEFORM_REVIEW_TITLE
    ).one()
    assert review.selected_template_json["source"] == "default"

    gen = db_session.query(Brief).filter_by(
        title=seed_demo.FREEFORM_GENERATED_TITLE
    ).one()
    assert gen.selected_template_json["source"] == "reference"
    assert gen.reference_template_text


def test_pre_generated_freeform_snapshot_has_structured_and_template(db_session):
    from app.models import Brief

    seed_demo.seed(db_session)

    gen = db_session.query(Brief).filter_by(
        title=seed_demo.FREEFORM_GENERATED_TITLE
    ).one()
    snapshot = gen.versions[0].context_snapshot_json
    assert set(snapshot.keys()) == {"structured", "template"}
    assert snapshot["template"]["source"] == "reference"
    assert gen.versions[0].generation_meta_json.get("template_source") == "reference"
