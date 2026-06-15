from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class BriefStatus(str, Enum):
    """Допустимые статусы брифа."""

    draft = "draft"
    in_progress = "in_progress"
    generated = "generated"
    archived = "archived"


class BriefType(str, Enum):
    """Допустимые типы брифа."""

    creative = "creative"
    client = "client"
    production = "production"
    ai_production = "ai_production"
    landing = "landing"
    video = "video"
    presentation = "presentation"
    campaign = "campaign"
    custom = "custom"


# --- context_json ---------------------------------------------------------


class MessageHierarchy(BaseModel):
    """Иерархия сообщений брифа."""

    primary: str = ""
    secondary: list[str] = Field(default_factory=list)
    background: list[str] = Field(default_factory=list)


class BriefContext(BaseModel):
    """Полная структура context_json (используется для чтения и нормализации)."""

    author_role: str = ""
    task_type: str = ""
    result_format: str = ""
    usage_context: str = ""
    main_goal: str = ""
    promotion_object: str = ""
    key_messages: list[str] = Field(default_factory=list)
    message_hierarchy: MessageHierarchy = Field(default_factory=MessageHierarchy)
    technology_role: str = ""
    production_principle: str = ""
    visual_context: str = ""
    tone: str = ""
    anti_tone: str = ""
    must_have: list[str] = Field(default_factory=list)
    restrictions: list[str] = Field(default_factory=list)
    dramaturgy: str = ""
    final_frame_or_cta: str = ""
    deliverables: list[str] = Field(default_factory=list)
    kpi: list[str] = Field(default_factory=list)
    detail_level: str = ""
    assumptions: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class MessageHierarchyUpdate(BaseModel):
    """Частичное обновление иерархии сообщений."""

    primary: str | None = None
    secondary: list[str] | None = None
    background: list[str] | None = None

    model_config = ConfigDict(extra="forbid")


class BriefContextUpdate(BaseModel):
    """Частичное обновление context_json — присылаются только меняющиеся поля."""

    author_role: str | None = None
    task_type: str | None = None
    result_format: str | None = None
    usage_context: str | None = None
    main_goal: str | None = None
    promotion_object: str | None = None
    key_messages: list[str] | None = None
    message_hierarchy: MessageHierarchyUpdate | None = None
    technology_role: str | None = None
    production_principle: str | None = None
    visual_context: str | None = None
    tone: str | None = None
    anti_tone: str | None = None
    must_have: list[str] | None = None
    restrictions: list[str] | None = None
    dramaturgy: str | None = None
    final_frame_or_cta: str | None = None
    deliverables: list[str] | None = None
    kpi: list[str] | None = None
    detail_level: str | None = None
    assumptions: list[str] | None = None
    open_questions: list[str] | None = None

    model_config = ConfigDict(extra="forbid")


# --- brief -----------------------------------------------------------------


class BriefCreate(BaseModel):
    """Данные для создания брифа. Всё опционально — старт wizard с черновика."""

    title: str = Field(default="Новый бриф", max_length=255)
    brief_type: BriefType = BriefType.custom

    model_config = ConfigDict(extra="forbid")


class BriefUpdate(BaseModel):
    """Обновление мета-полей брифа (title, status, brief_type, current_step)."""

    title: str | None = Field(default=None, max_length=255)
    status: BriefStatus | None = None
    brief_type: BriefType | None = None
    current_step: str | None = Field(default=None, max_length=50)

    model_config = ConfigDict(extra="forbid")


class BriefRead(BaseModel):
    """Полное представление брифа."""

    id: int
    title: str
    status: BriefStatus
    brief_type: BriefType
    current_step: str
    context_json: BriefContext
    generated_markdown: str | None = None
    generated_from_context_hash: str | None = None
    is_generated_outdated: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BriefListItem(BaseModel):
    """Облегчённое представление брифа для списка."""

    id: int
    title: str
    status: BriefStatus
    brief_type: BriefType
    current_step: str
    is_generated_outdated: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BriefVersionRead(BaseModel):
    """Версия (снимок) одной полной генерации брифа."""

    id: int
    brief_id: int
    version_number: int
    generated_markdown: str
    context_snapshot_json: dict[str, Any]
    generation_meta_json: dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- AI --------------------------------------------------------------------


class ClarifyingQuestion(BaseModel):
    """Уточняющий вопрос из AI-анализа брифа."""

    field: str = ""
    question: str = ""
    type: str = "text"
    options: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")


class BriefAnalysis(BaseModel):
    """Результат AI-анализа context_json (в БД не сохраняется)."""

    completion_score: float = 0.0
    summary: str = ""
    strong_fields: list[str] = Field(default_factory=list)
    weak_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    clarifying_questions: list[ClarifyingQuestion] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="ignore")

    @field_validator("completion_score")
    @classmethod
    def _normalize_score(cls, value: float) -> float:
        # модель может вернуть проценты (0–100) вместо доли (0–1)
        if 1 < value <= 100:
            value = value / 100
        return max(0.0, min(1.0, value))


class SectionRegenerateRequest(BaseModel):
    """Запрос на перегенерацию одного раздела markdown-брифа."""

    section: str = Field(min_length=1, max_length=200)
    instruction: str = Field(default="", max_length=4000)

    model_config = ConfigDict(extra="forbid")


class SectionRegenerateResponse(BaseModel):
    """Новый текст раздела (документ целиком не патчится)."""

    section: str
    content: str
