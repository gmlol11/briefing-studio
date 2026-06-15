from typing import Any

from pydantic import ValidationError

from app.models import Brief
from app.schemas import BriefAnalysis
from app.services.llm_service import LLMError, get_llm_service
from app.services.prompt_service import get_prompt


def _brief_payload(brief: Brief) -> dict[str, Any]:
    return {
        "title": brief.title,
        "brief_type": brief.brief_type,
        "context_json": brief.context_json,
    }


def analyze_brief(brief: Brief) -> dict[str, Any]:
    """AI-анализ context_json: готовность, слабые места, уточняющие вопросы."""
    raw = get_llm_service().chat_json(get_prompt("analyze_brief"), _brief_payload(brief))
    try:
        return BriefAnalysis.model_validate(raw).model_dump()
    except ValidationError as exc:
        raise LLMError("LLM вернула анализ неожиданной структуры") from exc


def generate_brief(brief: Brief) -> str:
    """Генерация финального markdown-брифа по context_json."""
    return get_llm_service().chat_markdown(
        get_prompt("generate_brief"), _brief_payload(brief)
    )


def regenerate_section(brief: Brief, section: str, instruction: str) -> str:
    """Переписывает один раздел готового markdown-брифа по инструкции."""
    payload = _brief_payload(brief) | {
        "generated_markdown": brief.generated_markdown,
        "section": section,
        "instruction": instruction,
    }
    return get_llm_service().chat_markdown(get_prompt("regenerate_section"), payload)
