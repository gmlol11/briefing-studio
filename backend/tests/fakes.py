"""Deterministic stand-ins for LLM output in brand-aware flow tests.

No network, no API key. These replace the LLM calls made by
``app.services.brand_brief_service``. Shapes match ``app.schemas_brand``
(InputSummary / StructuredBrief / Clarifications), so the router still
re-validates them for real.
"""

from typing import Any

INPUT_SUMMARY: dict[str, Any] = {
    "summary": "Клиент хочет запустить рекламную кампанию нового энергетика.",
    "key_facts": ["ЦА 18-25", "ограниченный бюджет"],
    "explicit_requirements": ["вертикальное видео для соцсетей"],
    "constraints": ["без алкогольных ассоциаций"],
    "uncertain_fragments": ["сроки не указаны"],
}


def field(
    key: str,
    value: str = "значение",
    *,
    status: str = "confirmed",
    source_type: str = "client_brief",
    confidence: float = 0.9,
    comment: str = "",
) -> dict[str, Any]:
    """Build one StructuredField-shaped dict."""
    return {
        "key": key,
        "value": value,
        "source_type": source_type,
        "source_ref": "",
        "confidence": confidence,
        "status": status,
        "comment": comment,
    }


def structured(*fields: dict[str, Any]) -> dict[str, Any]:
    """Build a StructuredBrief-shaped dict."""
    return {"fields": list(fields)}


# Structure with no blocking fields — generate-final is allowed.
STRUCTURED_OK = structured(
    field("goal", "узнаваемость бренда"),
    field("audience", "18-25", source_type="brand_bible", status="confirmed_by_brand"),
    field("format", "вертикальное видео 15с"),
)

# Structure with a blocking critical_missing field — generate-final must 409.
STRUCTURED_CRITICAL = structured(
    field("goal", "узнаваемость бренда"),
    field(
        "budget",
        "",
        status="critical_missing",
        confidence=0.0,
        comment="бюджет не указан в брифе",
    ),
)

CLARIFICATIONS: dict[str, Any] = {
    "questions": [
        {
            "id": "q1",
            "field": "budget",
            "question": "Какой бюджет кампании?",
            "importance": "critical",
            "options": [],
        }
    ]
}

# Result of applying answers — the previously-critical field is resolved.
STRUCTURED_RESOLVED = structured(
    field("goal", "узнаваемость бренда"),
    field("budget", "500000 руб", status="confirmed", source_type="user_edit"),
)

FINAL_MARKDOWN = "# Бриф\n\nФинальный бриф (детерминированный мок).\n"


class FakeLLM:
    """Stand-in for LLMService returning canned content.

    Used only to exercise brand_brief_service's own Pydantic validation
    (injected via brand_brief_service.get_llm_service).
    """

    def __init__(
        self, *, json_response: Any = None, markdown_response: str = ""
    ) -> None:
        self._json = json_response
        self._markdown = markdown_response

    def chat_json(self, system_prompt: str, payload: dict[str, Any]) -> Any:
        return self._json

    def chat_markdown(self, system_prompt: str, payload: dict[str, Any]) -> str:
        return self._markdown
