"""GovUX Studio — studio_runs table (AI prototype generator).

Idempotent (IF NOT EXISTS) so it is safe on a DB already created from the updated
db/schema.sql as well as one still on an older baseline. Keeps
db/schema.sql <-> models.py <-> migrations in sync (domain rule 4).

Revision ID: 0008_studio_runs
Revises: 0007_insufficient_evidence
Create Date: 2026-07-16
"""
from alembic import op

revision = "0008_studio_runs"
down_revision = "0007_insufficient_evidence"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE IF NOT EXISTS studio_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        UUID NOT NULL REFERENCES organisations(id),
    requested_by  UUID REFERENCES users(id),
    status        TEXT NOT NULL DEFAULT 'generating',
    inputs        JSONB NOT NULL DEFAULT '{}'::jsonb,
    pages         JSONB,
    overall_score NUMERIC(5,2),
    band          TEXT,
    iterations    INTEGER NOT NULL DEFAULT 0,
    findings      JSONB,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_inr      NUMERIC(10,2) NOT NULL DEFAULT 0,
    error         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_studio_org_time ON studio_runs(org_id, created_at DESC);
"""

DOWN = "DROP TABLE IF EXISTS studio_runs;"


def upgrade():
    op.execute(UP)


def downgrade():
    op.execute(DOWN)
