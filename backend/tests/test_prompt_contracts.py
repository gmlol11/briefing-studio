"""Prompt-content contracts that lock in the B1 Intellectual Layer guarantees.

Pure unit tests: no LLM, no DB. They load prompts through the same
``get_prompt()`` path the application uses, and assert on *stable tokens*
(epistemic labels, anti-hallucination markers, section numbers) rather than
whole sentences — so legitimate wording tweaks don't break them, but dropping
a guarantee does.

Intentionally out of scope here: ``regenerate_section.md`` (B2.2 will change
it; asserting its current shape now would create a red test on purpose).
"""

from app.services.prompt_service import get_prompt

# Epistemic markers shared by both final-generation prompts.
EPISTEMIC_LABELS = ["Факт:", "Интерпретация:", "Гипотеза:", "Направление:"]

# Stable anti-hallucination marker present verbatim in both prompts.
ANTI_HALLUCINATION_MARKER = "Не выдумывай"

# Wizard prompt's fixed 17-section contract, keyed by stable number prefixes
# (titles may be reworded; the numbered order must not change).
WIZARD_SECTION_TOKENS = [f"## {n}." for n in range(1, 18)]


def assert_contains_all(text: str, tokens: list[str]) -> None:
    """Every token must appear somewhere in the prompt."""
    missing = [t for t in tokens if t not in text]
    assert not missing, f"prompt is missing required tokens: {missing}"


def assert_tokens_in_order(text: str, tokens: list[str]) -> None:
    """Tokens must appear, and each strictly after the previous one."""
    last = -1
    for token in tokens:
        idx = text.find(token, last + 1)
        assert idx != -1, f"token not found after position {last}: {token!r}"
        assert idx > last, f"token out of order: {token!r}"
        last = idx


# ── generate_final_brand_brief.md (brand-aware flow) ─────────────────────────


def test_brand_prompt_has_epistemic_labels():
    assert_contains_all(get_prompt("generate_final_brand_brief"), EPISTEMIC_LABELS)


def test_brand_prompt_keeps_anti_hallucination_guard():
    assert ANTI_HALLUCINATION_MARKER in get_prompt("generate_final_brand_brief")


def test_brand_prompt_keeps_template_mode_and_field_statuses():
    prompt = get_prompt("generate_final_brand_brief")
    assert_contains_all(
        prompt,
        [
            "selected_template_json",
            "critical_missing",
            "conflict",
            "needs_confirmation",
        ],
    )


# ── generate_brief.md (wizard flow) ──────────────────────────────────────────


def test_wizard_prompt_has_epistemic_labels():
    assert_contains_all(get_prompt("generate_brief"), EPISTEMIC_LABELS)


def test_wizard_prompt_keeps_anti_hallucination_guard():
    assert ANTI_HALLUCINATION_MARKER in get_prompt("generate_brief")


def test_wizard_prompt_keeps_all_17_sections_in_order():
    assert_tokens_in_order(get_prompt("generate_brief"), WIZARD_SECTION_TOKENS)


def test_wizard_prompt_references_context_json_as_source():
    # Output must be grounded in context_json, not invented.
    assert "context_json" in get_prompt("generate_brief")
