from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
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

    @property
    def is_generated_outdated(self) -> bool:
        """Контекст изменился после последней генерации markdown."""
        if not self.generated_markdown or not self.generated_from_context_hash:
            return False
        return context_hash(self.context_json or {}) != self.generated_from_context_hash


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
