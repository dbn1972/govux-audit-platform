"""Invitations — let a colleague join an EXISTING organisation.

Until now users.org_id started NULL and `POST /v1/domains` auto-provisioned a
one-person organisation, so two people from the same ministry ended up in two
disconnected orgs with no way to merge. Additive + idempotent; schema.sql <->
models.py <-> migration kept in sync (invariant #5).

Revision ID: 0013_invitations
Revises: 0012_guideline_library_seed
Create Date: 2026-08-11
"""
from alembic import op

revision = "0013_invitations"
down_revision = "0012_guideline_library_seed"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS invitations (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            org_id       UUID NOT NULL REFERENCES organisations(id),
            email        CITEXT NOT NULL,
            role         user_role NOT NULL DEFAULT 'contributor',
            invited_by   UUID REFERENCES users(id),
            status       TEXT NOT NULL DEFAULT 'pending',
            expires_at   TIMESTAMPTZ NOT NULL,
            accepted_at  TIMESTAMPTZ,
            accepted_by  UUID REFERENCES users(id),
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT chk_gov_invite_email CHECK (email ~* '[@.](gov|nic)\\.in$')
        );
    """)
    # at most ONE live invite per address, so acceptance is never order-dependent
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_invite_pending_email "
               "ON invitations(email) WHERE status = 'pending';")
    op.execute("CREATE INDEX IF NOT EXISTS idx_invite_org_time "
               "ON invitations(org_id, created_at DESC);")


def downgrade():
    op.execute("DROP TABLE IF EXISTS invitations;")
