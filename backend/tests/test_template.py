"""Template layer — commit #1 scope.

Unit: default_template() is schema-valid. DB: the new nullable Brief columns
default to NULL (exposed in BriefRead) and round-trip through the ORM.
"""

import pytest

from app.models import Brief, default_template
from app.schemas_brand import BriefTemplate


def test_default_template_is_schema_valid():
    tpl = BriefTemplate.model_validate(default_template())
    assert tpl.source.value == "default"
    assert tpl.sections
    required = {f.key for s in tpl.sections for f in s.fields if f.required}
    assert {"main_goal", "target_audience", "key_message"} <= required


def test_default_template_sections_have_keys_and_titles():
    tpl = BriefTemplate.model_validate(default_template())
    for section in tpl.sections:
        assert section.key and section.title


@pytest.mark.db
def test_template_columns_default_null_in_api(client):
    brand_id = client.post("/api/brands", json={"name": "B"}).json()["id"]
    brief = client.post("/api/briefs/freeform", json={"brand_id": brand_id}).json()
    assert brief["selected_template_json"] is None
    assert brief["reference_template_text"] is None


@pytest.mark.db
def test_template_columns_persist_via_orm(db_session):
    tpl = default_template()
    brief = Brief(
        title="tpl", selected_template_json=tpl, reference_template_text="ref"
    )
    db_session.add(brief)
    db_session.commit()

    fetched = db_session.get(Brief, brief.id)
    assert fetched.selected_template_json == tpl
    assert fetched.reference_template_text == "ref"
