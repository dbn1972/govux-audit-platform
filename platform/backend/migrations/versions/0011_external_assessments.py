"""External assessments — manual-assurance ledger (G9/G11/G13).

Idempotent additive table. schema.sql <-> models.py <-> migration in sync.

Revision ID: 0011_external_assessments
Revises: 0010_integrity
Create Date: 2026-07-20
"""
from alembic import op

revision = "0011_external_assessments"
down_revision = "0010_integrity"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS external_assessments (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id       UUID NOT NULL REFERENCES organisations(id),
            domain_id    UUID REFERENCES domains(id),
            kind         TEXT NOT NULL,
            title        TEXT NOT NULL,
            agency       TEXT,
            assessed_on  DATE,
            outcome      TEXT NOT NULL DEFAULT 'in_progress',
            summary      TEXT,
            report_ref   TEXT,
            created_by   UUID REFERENCES users(id),
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS idx_extassess_org_time "
               "ON external_assessments(org_id, created_at DESC);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_extassess_domain "
               "ON external_assessments(domain_id);")


def downgrade():
    op.execute("DROP TABLE IF EXISTS external_assessments;")
