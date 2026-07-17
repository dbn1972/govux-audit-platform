"""Integrity Engine — audits.integrity block (anti-gaming).

Idempotent additive column. schema.sql <-> models.py <-> migration in sync.

Revision ID: 0010_integrity
Revises: 0009_studio_tenant_publish
Create Date: 2026-07-16
"""
from alembic import op

revision = "0010_integrity"
down_revision = "0009_studio_tenant_publish"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE audits ADD COLUMN IF NOT EXISTS integrity JSONB;")


def downgrade():
    op.execute("ALTER TABLE audits DROP COLUMN IF EXISTS integrity;")
