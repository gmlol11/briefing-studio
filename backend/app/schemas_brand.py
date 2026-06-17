"""Schemas for the brand-aware freeform briefing flow (additive, separate module)."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


# --- enums ----------------------------------------------------------------


class SourceType(str, Enum):
    brand_bible = "brand_bible"
    client_brief = "client_brief"
    transcript = "transcript"
    manager_note = "manager_note"
    inference = "inference"
    internet = "internet"  # зарезервировано: реального web-search в MVP-1 нет
    user_edit = "user_edit"
    unknown = "unknown"


class FieldStatus(str, Enum):
    confirmed = "confirmed"
    confirmed_by_brand = "confirmed_by_brand"
    needs_confirmation = "needs_confirmation"
    critical_missing = "critical_missing"
    optional_missing = "optional_missing"
    conflict = "conflict"
    rejected = "rejected"


# --- brand ----------------------------------------------------------------


class BrandCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    brand_context_json: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class BrandUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    brand_context_json: dict[str, Any] | None = None

    model_config = ConfigDict(extra="forbid")


class BrandRead(BaseModel):
    id: int
    name: str
    description: str | None = None
    brand_context_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BrandListItem(BaseModel):
    id: int
    name: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- freeform structures (validated against LLM output before storage) ----


class InputSummary(BaseModel):
    """Структурированное summary свободного клиентского ввода."""

    summary: str = ""
    key_facts: list[str] = Field(default_factory=list)
    explicit_requirements: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    uncertain_fragments: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class StructuredField(BaseModel):
    """Один пункт структурированного брифа с evidence."""

    key: str = ""
    value: str = ""
    source_type: SourceType = SourceType.unknown
    source_ref: str = ""
    confidence: float = 0.0
    status: FieldStatus = FieldStatus.needs_confirmation
    comment: str = ""

    model_config = ConfigDict(extra="ignore")

    @field_validator("confidence")
    @classmethod
    def _clamp_confidence(cls, value: float) -> float:
        if 1 < value <= 100:  # модель могла вернуть проценты
            value = value / 100
        return max(0.0, min(1.0, value))


class StructuredBrief(BaseModel):
    fields: list[StructuredField] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class ClarificationImportance(str, Enum):
    critical = "critical"
    recommended = "recommended"
    optional = "optional"


class ClarificationQuestion(BaseModel):
    id: str = ""
    field: str = ""
    question: str = ""
    importance: ClarificationImportance = ClarificationImportance.recommended
    options: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class Clarifications(BaseModel):
    questions: list[ClarificationQuestion] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


# --- request bodies -------------------------------------------------------


class FreeformInputRequest(BaseModel):
    raw_input_text: str = Field(min_length=1)

    model_config = ConfigDict(extra="forbid")


class ClarificationAnswer(BaseModel):
    question_id: str = ""
    field: str = ""
    answer: str = ""

    model_config = ConfigDict(extra="forbid")


class ApplyClarificationsRequest(BaseModel):
    answers: list[ClarificationAnswer] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")
