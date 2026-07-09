"""cross-browser matrix + advisory ML anomaly score.

Idempotent. Keeps db/schema.sql <-> models.py <-> migrations in sync (rule 4).

Revision ID: 0003_browser_matrix_ml
Revises: 0002_gap_closure
Create Date: 2026-07-08
"""
from alembic import op

revision = "0003_browser_matrix_ml"
down_revision = "0002_gap_closure"
branch_labels = None
depends_on = None

UP = """
ALTER TABLE audits ADD COLUMN IF NOT EXISTS anomaly_score NUMERIC(6,3);

CREATE TABLE IF NOT EXISTS audit_browsers (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id       UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    engine         TEXT NOT NULL,
    loaded         BOOLEAN,
    status         INT,
    js_errors      INT,
    console_errors INT,
    overflow       BOOLEAN,
    broken_images  INT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_browser_audit ON audit_browsers(audit_id);
"""

DOWN = """
DROP TABLE IF EXISTS audit_browsers;
ALTER TABLE audits DROP COLUMN IF EXISTS anomaly_score;
"""


def upgrade():
    op.execute(UP)


def downgrade():
    op.execute(DOWN)
