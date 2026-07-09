"""runtime configuration store (admin-editable).

Revision ID: 0005_app_settings
Revises: 0004_public_scans
Create Date: 2026-07-08
"""
from alembic import op

revision = "0005_app_settings"
down_revision = "0004_public_scans"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY, value TEXT,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
"""


def upgrade():
    op.execute(UP)


def downgrade():
    op.execute("DROP TABLE IF EXISTS app_settings;")
