"""gap-closure additions — compliance verdict, field data, documents,
schedules, discovered domains, finding remediation/confidence.

Idempotent (IF NOT EXISTS) so it is safe on a DB already created from the
updated db/schema.sql as well as one still on the 0001 baseline. Keeps
db/schema.sql <-> models.py <-> migrations in sync (domain rule 4).

Revision ID: 0002_gap_closure
Revises: 0001_initial
Create Date: 2026-07-07
"""
from alembic import op

revision = "0002_gap_closure"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

UP = """
ALTER TABLE audits  ADD COLUMN IF NOT EXISTS compliance_status TEXT;
ALTER TABLE audits  ADD COLUMN IF NOT EXISTS method     TEXT NOT NULL DEFAULT 'automated';
ALTER TABLE audits  ADD COLUMN IF NOT EXISTS confidence TEXT NOT NULL DEFAULT 'automated_only';
ALTER TABLE audits  ADD COLUMN IF NOT EXISTS field_data JSONB;

ALTER TABLE findings ADD COLUMN IF NOT EXISTS confidence  TEXT NOT NULL DEFAULT 'automated';
ALTER TABLE findings ADD COLUMN IF NOT EXISTS remediation TEXT;
ALTER TABLE findings ADD COLUMN IF NOT EXISTS title       TEXT;

CREATE TABLE IF NOT EXISTS audit_documents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id     UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
    url          TEXT NOT NULL,
    doc_type     TEXT NOT NULL DEFAULT 'pdf',
    pages        INT,
    tagged       BOOLEAN,
    has_title    BOOLEAN,
    has_lang     BOOLEAN,
    score        NUMERIC(5,2),
    issue_count  INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doc_audit ON audit_documents(audit_id);

CREATE TABLE IF NOT EXISTS schedules (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_id    UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    cadence      TEXT NOT NULL DEFAULT 'weekly',
    enabled      BOOLEAN NOT NULL DEFAULT true,
    next_run_at  TIMESTAMPTZ NOT NULL,
    last_run_at  TIMESTAMPTZ,
    created_by   UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_due ON schedules(enabled, next_run_at);

CREATE TABLE IF NOT EXISTS discovered_domains (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url          TEXT UNIQUE NOT NULL,
    source       TEXT,
    seed         TEXT,
    imported     BOOLEAN NOT NULL DEFAULT false,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""

DOWN = """
DROP TABLE IF EXISTS discovered_domains;
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS audit_documents;
ALTER TABLE findings DROP COLUMN IF EXISTS title;
ALTER TABLE findings DROP COLUMN IF EXISTS remediation;
ALTER TABLE findings DROP COLUMN IF EXISTS confidence;
ALTER TABLE audits DROP COLUMN IF EXISTS field_data;
ALTER TABLE audits DROP COLUMN IF EXISTS confidence;
ALTER TABLE audits DROP COLUMN IF EXISTS method;
ALTER TABLE audits DROP COLUMN IF EXISTS compliance_status;
"""


def upgrade():
    op.execute(UP)


def downgrade():
    op.execute(DOWN)
