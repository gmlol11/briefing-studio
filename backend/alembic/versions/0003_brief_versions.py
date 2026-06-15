"""add brief versions and context hash

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "briefs",
        sa.Column("generated_from_context_hash", sa.String(length=64), nullable=True),
    )
    op.create_table(
        "brief_versions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "brief_id",
            sa.Integer(),
            sa.ForeignKey("briefs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("generated_markdown", sa.Text(), nullable=False),
        sa.Column(
            "context_snapshot_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "generation_meta_json",
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
        sa.UniqueConstraint(
            "brief_id",
            "version_number",
            name="uq_brief_versions_brief_id_version_number",
        ),
    )
    op.create_index("ix_brief_versions_brief_id", "brief_versions", ["brief_id"])


def downgrade() -> None:
    op.drop_index("ix_brief_versions_brief_id", table_name="brief_versions")
    op.drop_table("brief_versions")
    op.drop_column("briefs", "generated_from_context_hash")
