from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.utils import context_hash


def default_context() -> dict[str, Any]:
    """Пустая структура context_json по умолчанию для нового брифа."""
    return {
        "author_role": "",
        "task_type": "",
        "result_format": "",
        "usage_context": "",
        "main_goal": "",
        "promotion_object": "",
        "key_messages": [],
        "message_hierarchy": {
            "primary": "",
            "secondary": [],
            "background": [],
        },
        "technology_role": "",
        "production_principle": "",
        "visual_context": "",
        "tone": "",
        "anti_tone": "",
        "must_have": [],
        "restrictions": [],
        "dramaturgy": "",
        "final_frame_or_cta": "",
        "deliverables": [],
        "kpi": [],
        "detail_level": "",
        "assumptions": [],
        "open_questions": [],
    }


def default_template() -> dict[str, Any]:
    """Дефолтная структура итогового freeform-брифа.

    Зеркалит разделы текущего финального промпта (generate_final_brand_brief):
    разделы документа + ключи структурированных полей, которые их наполняют.
    Используется как fallback, если у брифа нет selected_template_json.
    """

    def _field(key: str, label: str, *, required: bool = False) -> dict[str, Any]:
        return {"key": key, "label": label, "selected": True, "required": required, "hint": ""}

    def _section(
        key: str, title: str, fields: list[dict[str, Any]]
    ) -> dict[str, Any]:
        return {"key": key, "title": title, "description": "", "selected": True, "fields": fields}

    return {
        "name": "Коммуникационный бриф (по умолчанию)",
        "source": "default",
        "sections": [
            _section("context", "Контекст и бренд", []),
            _section("goal", "Главная цель", [_field("main_goal", "Главная цель", required=True)]),
            _section(
                "audience",
                "Целевая аудитория",
                [_field("target_audience", "Целевая аудитория", required=True)],
            ),
            _section(
                "key_message",
                "Ключевое сообщение",
                [_field("key_message", "Ключевое сообщение", required=True)],
            ),
            _section(
                "tone", "Тональность (Tone of Voice)", [_field("tone_of_voice", "Тональность")]
            ),
            _section(
                "object", "Объект продвижения", [_field("product_or_object", "Объект продвижения")]
            ),
            _section("channels", "Каналы коммуникации", [_field("channels", "Каналы")]),
            _section("mandatories", "Обязательно (Mandatories)", [_field("mandatories", "Mandatories")]),
            _section("restrictions", "Ограничения (Don'ts)", [_field("restrictions", "Ограничения")]),
            _section("deliverables", "Deliverables", [_field("deliverables", "Deliverables")]),
            _section("kpi", "KPI", [_field("kpi", "KPI")]),
            _section("assumptions", "Допущения и открытые вопросы", []),
        ],
    }


class Brief(Base):
    """Доменная модель брифа."""

    __tablename__ = "briefs"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    brief_type: Mapped[str] = mapped_column(String(50), nullable=False, default="custom")
    current_step: Mapped[str] = mapped_column(String(50), nullable=False, default="brief_type")
    context_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=default_context
    )
    generated_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    generated_from_context_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True
    )

    # --- brand-aware freeform flow (additive, all nullable / defaulted) ---
    # Старый wizard-flow эти поля не использует (остаются NULL/false).
    brand_id: Mapped[int | None] = mapped_column(
        ForeignKey("brands.id", ondelete="SET NULL"), nullable=True, index=True
    )
    raw_input_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_summary_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )
    is_input_summary_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    structured_brief_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )
    clarifications_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )

    # --- output template (additive, nullable; freeform-only) ---
    # Старый wizard-flow и freeform-брифы без шаблона эти поля не используют
    # (остаются NULL → fallback на дефолтную структуру).
    reference_template_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_template_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    versions: Mapped[list["BriefVersion"]] = relationship(
        back_populates="brief",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="BriefVersion.version_number",
    )
    brand: Mapped["Brand | None"] = relationship(back_populates="briefs")

    def generated_hash_source(self) -> dict[str, Any]:
        """Источник для context_hash и is_generated_outdated.

        - Wizard (`structured_brief_json is None`) — `context_json` (без изменений).
        - Freeform без шаблона — только `structured_brief_json` (прежнее поведение).
        - Freeform с `selected_template_json` — `{structured, template}`, чтобы
          изменение шаблона после генерации делало бриф устаревшим.
        """
        if self.structured_brief_json is None:
            return self.context_json or {}
        if self.selected_template_json is not None:
            return {
                "structured": self.structured_brief_json,
                "template": self.selected_template_json,
            }
        return self.structured_brief_json

    @property
    def is_generated_outdated(self) -> bool:
        """Источник брифа изменился после последней генерации markdown."""
        if not self.generated_markdown or not self.generated_from_context_hash:
            return False
        return context_hash(self.generated_hash_source()) != self.generated_from_context_hash


class BriefVersion(Base):
    """Снимок одной полной генерации брифа."""

    __tablename__ = "brief_versions"
    __table_args__ = (
        UniqueConstraint(
            "brief_id", "version_number", name="uq_brief_versions_brief_id_version_number"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    brief_id: Mapped[int] = mapped_column(
        ForeignKey("briefs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_number: Mapped[int] = mapped_column(nullable=False)
    generated_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    context_snapshot_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    generation_meta_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    brief: Mapped[Brief] = relationship(back_populates="versions")


class Brand(Base):
    """Бренд: контейнер контекста для brand-aware freeform-брифов."""

    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    brand_context_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    # Визуальный слой бренда (цвета/лого/шрифт/стиль) для preview/export.
    # Отдельно от brand_context_json, который дословно уходит в LLM-промпты.
    # Аддитивно, NOT NULL default {} — старые бренды получают пустую айдентику.
    brand_identity_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    sources: Mapped[list["BrandSource"]] = relationship(
        back_populates="brand",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="BrandSource.created_at",
    )
    briefs: Mapped[list["Brief"]] = relationship(
        back_populates="brand", passive_deletes=True
    )


class BrandSource(Base):
    """Источник данных бренда (заготовка под brand_bible/transcript/… в будущем)."""

    __tablename__ = "brand_sources"

    id: Mapped[int] = mapped_column(primary_key=True)
    brand_id: Mapped[int] = mapped_column(
        ForeignKey("brands.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, default="unknown")
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    meta_json: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    brand: Mapped[Brand] = relationship(back_populates="sources")
