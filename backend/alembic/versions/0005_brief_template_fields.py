"""add brief output-template fields (additive)

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-18

Аддитивная миграция template-слоя freeform-флоу — только добавление nullable
колонок (без backfill / drop / rename), существующие колонки не меняются:
- briefs.reference_template_text (Text, nullable);
- briefs.selected_template_json (JSONB, nullable).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "briefs", sa.Column("reference_template_text", sa.Text(), nullable=True)
    )
    op.add_column(
        "briefs",
        sa.Column(
            "selected_template_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("briefs", "selected_template_json")
    op.drop_column("briefs", "reference_template_text")
