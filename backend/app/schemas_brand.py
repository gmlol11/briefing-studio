"""Schemas for the brand-aware freeform briefing flow (additive, separate module)."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


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
