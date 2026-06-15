"""No-DB unit tests for context hashing, default context, and deep-merge."""

from app.models import default_context
from app.routers.briefs import _deep_merge
from app.utils import context_hash


def test_context_hash_is_stable_regardless_of_key_order():
    a = {"b": {"y": [1, 2], "x": "ё"}, "a": "x", "c": []}
    b = {"a": "x", "c": [], "b": {"x": "ё", "y": [1, 2]}}
    assert context_hash(a) == context_hash(b)
    assert len(context_hash(a)) == 64  # sha256 hex


def test_context_hash_changes_when_values_change():
    a = {"a": "x", "b": {"y": [1, 2]}}
    assert context_hash(a) != context_hash({"a": "x", "b": {"y": [2, 1]}})


def test_default_context_has_required_high_level_fields():
    ctx = default_context()
    required = (
        "author_role",
        "task_type",
        "result_format",
        "usage_context",
        "main_goal",
        "promotion_object",
        "key_messages",
        "message_hierarchy",
        "tone",
        "must_have",
        "restrictions",
        "deliverables",
        "kpi",
    )
    for key in required:
        assert key in ctx, f"missing default context key: {key}"
    assert set(ctx["message_hierarchy"]) == {"primary", "secondary", "background"}
    # empties by default
    assert ctx["main_goal"] == ""
    assert ctx["key_messages"] == []


def test_deep_merge_preserves_unrelated_keys_and_merges_nested():
    base = default_context()
    base["tone"] = "warm"
    base["key_messages"] = ["a", "b"]

    merged = _deep_merge(
        base,
        {"main_goal": "grow", "message_hierarchy": {"primary": "lead"}},
    )

    # new values applied
    assert merged["main_goal"] == "grow"
    assert merged["message_hierarchy"]["primary"] == "lead"
    # unrelated keys preserved
    assert merged["tone"] == "warm"
    assert merged["key_messages"] == ["a", "b"]
    # nested dict merged (not replaced): siblings survive
    assert merged["message_hierarchy"]["secondary"] == []
    assert merged["message_hierarchy"]["background"] == []
    # base is not mutated
    assert base["main_goal"] == ""


def test_deep_merge_replaces_lists_and_scalars_wholesale():
    base = {"items": ["a", "b"], "nested": {"x": 1, "y": 2}, "tone": "old"}
    merged = _deep_merge(base, {"items": ["c"], "tone": "new", "nested": {"x": 9}})
    assert merged["items"] == ["c"]  # list replaced, not concatenated
    assert merged["tone"] == "new"  # scalar replaced
    assert merged["nested"] == {"x": 9, "y": 2}  # dict merged
