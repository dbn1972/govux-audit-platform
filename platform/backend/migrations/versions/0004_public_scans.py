"""free public scans + page-quota escalation requests.

Idempotent. Keeps db/schema.sql <-> models.py <-> migrations in sync (rule 4).

Revision ID: 0004_public_scans
Revises: 0003_browser_matrix_ml
Create Date: 2026-07-08
"""
from alembic import op

revision = "0004_public_scans"
down_revision = "0003_browser_matrix_ml"
branch_labels = None
depends_on = None

UP = """
CREATE TABLE IF NOT EXISTS public_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL, host TEXT, status TEXT NOT NULL DEFAULT 'queued',
    requested_by UUID REFERENCES users(id), overall_score NUMERIC(5,2), band TEXT,
    pdf_key TEXT, ip INET, error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS idx_pubscan_status ON public_scans(status, created_at);
CREATE INDEX IF NOT EXISTS idx_pubscan_host ON public_scans(host);

CREATE TABLE IF NOT EXISTS scan_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id), domain_id UUID REFERENCES domains(id),
    requested_pages INT NOT NULL, reason TEXT, status TEXT NOT NULL DEFAULT 'pending',
    decided_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), decided_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS idx_scanreq_user ON scan_requests(user_id, status);
"""

DOWN = "DROP TABLE IF EXISTS scan_requests; DROP TABLE IF EXISTS public_scans;"


def upgrade():
    op.execute(UP)


def downgrade():
    op.execute(DOWN)
