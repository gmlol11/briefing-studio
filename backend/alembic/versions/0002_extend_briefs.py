"""extend briefs table for stage 2

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "briefs",
        sa.Column(
            "brief_type",
            sa.String(length=50),
            nullable=False,
            server_default="custom",
        ),
    )
    op.add_column(
        "briefs",
        sa.Column(
            "current_step",
            sa.String(length=50),
            nullable=False,
            server_default="brief_type",
        ),
    )
    op.add_column(
        "briefs",
        sa.Column(
            "context_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "briefs",
        sa.Column("generated_markdown", sa.Text(), nullable=True),
    )
    op.add_column(
        "briefs",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("briefs", "updated_at")
    op.drop_column("briefs", "generated_markdown")
    op.drop_column("briefs", "context_json")
    op.drop_column("briefs", "current_step")
    op.drop_column("briefs", "brief_type")
