"""add brand_identity_json on brands (additive)

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-25

Аддитивная миграция brand-identity-слоя — одна NOT NULL колонка с
server_default '{}'::jsonb на brands (существующие бренды получают пустую
айдентику). Существующие колонки, включая brand_context_json, не меняются.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "brands",
        sa.Column(
            "brand_identity_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("brands", "brand_identity_json")
