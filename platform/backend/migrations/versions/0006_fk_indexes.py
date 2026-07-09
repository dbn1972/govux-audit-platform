"""foreign-key & league-sort indexes (close FK-index gaps).

Revision ID: 0006_fk_indexes
Revises: 0005_app_settings
Create Date: 2026-07-08

Additive + idempotent (CREATE INDEX IF NOT EXISTS) so it is safe on live DBs. The
`ranking_publications` table already exists in schema.sql; this only adds indexes.
"""
from alembic import op

revision = "0006_fk_indexes"
down_revision = "0005_app_settings"
branch_labels = None
depends_on = None

INDEXES = [
    ("idx_users_org", "users(org_id)"),
    ("idx_domain_created_by", "domains(created_by)"),
    ("idx_audit_requested_by", "audits(requested_by)"),
    ("idx_session_device", "sessions(device_id)"),
    ("idx_log_device", "audit_log(device_id)"),
    ("idx_scanreq_domain", "scan_requests(domain_id)"),
    ("idx_scanreq_decider", "scan_requests(decided_by)"),
]


def upgrade():
    for name, target in INDEXES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {name} ON {target};")
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_completed_score "
               "ON audits(overall_score DESC) WHERE status = 'completed';")


def downgrade():
    for name, _ in INDEXES:
        op.execute(f"DROP INDEX IF EXISTS {name};")
    op.execute("DROP INDEX IF EXISTS idx_audit_completed_score;")
