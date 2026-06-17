"""add brands, brand_sources and freeform fields on briefs (additive)

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-17

Полностью аддитивная миграция для brand-aware freeform-флоу:
- новые таблицы brands, brand_sources;
- новые nullable / defaulted колонки на briefs.
Существующие колонки (включая context_json) не меняются.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "brands",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "brand_context_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_table(
        "brand_sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "brand_id",
            sa.Integer(),
            sa.ForeignKey("brands.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_type",
            sa.String(length=50),
            nullable=False,
            server_default="unknown",
        ),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("content_text", sa.Text(), nullable=True),
        sa.Column("source_url", sa.String(length=1024), nullable=True),
        sa.Column("file_name", sa.String(length=512), nullable=True),
        sa.Column(
            "meta_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_brand_sources_brand_id", "brand_sources", ["brand_id"])

    # --- additive columns on briefs ---
    op.add_column("briefs", sa.Column("brand_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_briefs_brand_id_brands",
        "briefs",
        "brands",
        ["brand_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_briefs_brand_id", "briefs", ["brand_id"])
    op.add_column("briefs", sa.Column("raw_input_text", sa.Text(), nullable=True))
    op.add_column(
        "briefs",
        sa.Column(
            "input_summary_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "briefs",
        sa.Column(
            "is_input_summary_verified",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "briefs",
        sa.Column(
            "structured_brief_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "briefs",
        sa.Column(
            "clarifications_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("briefs", "clarifications_json")
    op.drop_column("briefs", "structured_brief_json")
    op.drop_column("briefs", "is_input_summary_verified")
    op.drop_column("briefs", "input_summary_json")
    op.drop_column("briefs", "raw_input_text")
    op.drop_index("ix_briefs_brand_id", table_name="briefs")
    op.drop_constraint("fk_briefs_brand_id_brands", "briefs", type_="foreignkey")
    op.drop_column("briefs", "brand_id")
    op.drop_index("ix_brand_sources_brand_id", table_name="brand_sources")
    op.drop_table("brand_sources")
    op.drop_table("brands")
