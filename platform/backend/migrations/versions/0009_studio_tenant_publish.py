"""GovUX Studio — per-tenant entitlement + public publish/showcase.

Idempotent additions. Keeps db/schema.sql <-> models.py <-> migrations in sync.

Revision ID: 0009_studio_tenant_publish
Revises: 0008_studio_runs
Create Date: 2026-07-16
"""
from alembic import op

revision = "0009_studio_tenant_publish"
down_revision = "0008_studio_runs"
branch_labels = None
depends_on = None

UP = """
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS studio_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE studio_runs  ADD COLUMN IF NOT EXISTS published    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE studio_runs  ADD COLUMN IF NOT EXISTS public_slug  TEXT UNIQUE;
ALTER TABLE studio_runs  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE studio_runs  ADD COLUMN IF NOT EXISTS title        TEXT;
CREATE INDEX IF NOT EXISTS idx_studio_slug ON studio_runs(public_slug) WHERE published;
"""

DOWN = """
DROP INDEX IF EXISTS idx_studio_slug;
ALTER TABLE studio_runs  DROP COLUMN IF EXISTS title;
ALTER TABLE studio_runs  DROP COLUMN IF EXISTS published_at;
ALTER TABLE studio_runs  DROP COLUMN IF EXISTS public_slug;
ALTER TABLE studio_runs  DROP COLUMN IF EXISTS published;
ALTER TABLE organisations DROP COLUMN IF EXISTS studio_enabled;
"""


def upgrade():
    op.execute(UP)


def downgrade():
    op.execute(DOWN)
