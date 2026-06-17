"""LLM operations for the brand-aware freeform briefing flow.

Reuses LLMService / PromptService; validates LLM JSON with Pydantic before returning.
Does not touch the wizard-flow service (brief_ai_service).
"""

from typing import Any

from pydantic import ValidationError

from app.models import Brief
from app.schemas_brand import (
    Clarifications,
    InputSummary,
    StructuredBrief,
)
from app.services.llm_service import LLMError, get_llm_service
from app.services.prompt_service import get_prompt


def _payload(brief: Brief, **extra: Any) -> dict[str, Any]:
    brand_ctx = brief.brand.brand_context_json if brief.brand else {}
    base: dict[str, Any] = {
        "title": brief.title,
        "brand_context_json": brand_ctx,
        "raw_input_text": brief.raw_input_text or "",
        "input_summary_json": brief.input_summary_json or {},
        "structured_brief_json": brief.structured_brief_json or {},
    }
    base.update(extra)
    return base


def _validate(model: type, raw: dict[str, Any], what: str) -> dict[str, Any]:
    try:
        return model.model_validate(raw).model_dump(mode="json")
    except ValidationError as exc:
        raise LLMError(f"LLM вернула {what} неожиданной структуры") from exc


def summarize_input(brief: Brief) -> dict[str, Any]:
    """Структурированное summary свободного клиентского ввода."""
    raw = get_llm_service().chat_json(get_prompt("summarize_input"), _payload(brief))
    return _validate(InputSummary, raw, "summary")


def structure_brief(brief: Brief) -> dict[str, Any]:
    """Структурировать бриф с evidence (source_type / confidence / status / comment)."""
    raw = get_llm_service().chat_json(
        get_prompt("structure_brand_brief"), _payload(brief)
    )
    return _validate(StructuredBrief, raw, "структуру брифа")


def generate_clarifications(brief: Brief) -> dict[str, Any]:
    """Сгенерировать уточняющие вопросы (critical / recommended / optional)."""
    raw = get_llm_service().chat_json(
        get_prompt("generate_clarifications"), _payload(brief)
    )
    return _validate(Clarifications, raw, "уточняющие вопросы")


def apply_clarification_answers(
    brief: Brief, answers: list[dict[str, Any]]
) -> dict[str, Any]:
    """Применить ответы пользователя к structured_brief_json."""
    raw = get_llm_service().chat_json(
        get_prompt("apply_clarifications"), _payload(brief, answers=answers)
    )
    return _validate(StructuredBrief, raw, "обновлённую структуру брифа")


def generate_final_brief(brief: Brief) -> str:
    """Сгенерировать финальный markdown-бриф из structured_brief_json."""
    return get_llm_service().chat_markdown(
        get_prompt("generate_final_brand_brief"), _payload(brief)
    )
