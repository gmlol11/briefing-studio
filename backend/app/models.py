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

    @property
    def is_generated_outdated(self) -> bool:
        """Контекст изменился после последней генерации markdown.

        Для freeform-брифа источником служит structured_brief_json (если задан),
        иначе — context_json (поведение wizard-флоу не меняется)."""
        if not self.generated_markdown or not self.generated_from_context_hash:
            return False
        source = (
            self.structured_brief_json
            if self.structured_brief_json is not None
            else (self.context_json or {})
        )
        return context_hash(source) != self.generated_from_context_hash


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
