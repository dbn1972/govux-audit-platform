"""Domain ownership is decided by proof, not by who registered first.

`domains.url` carried a global UNIQUE, so the first account to register a host
owned it forever. They never had to verify: the row simply sat `pending`, the
real owner got a bare 409 with no way to see who held it or contest it, and no
release path existed anywhere. One careless registration permanently locked a
domain out of the platform.

Uniqueness now applies to PROVEN ownership. Several organisations may hold a
pending claim on the same host, each with its own token, and whoever passes
DNS/file verification wins — competing claims become `superseded`.

Revision ID: 0014_domain_claims
Revises: 0013_invitations
Create Date: 2026-08-12
"""
from alembic import op

revision = "0014_domain_claims"
down_revision = "0013_invitations"
branch_labels = None
depends_on = None


def upgrade():
    # ALTER TYPE ... ADD VALUE cannot be used in the same transaction that later
    # references the new label, so add it in its own autocommit block first.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE verify_status ADD VALUE IF NOT EXISTS 'superseded'")

    op.execute("ALTER TABLE domains DROP CONSTRAINT IF EXISTS domains_url_key")
    # Only one VERIFIED row per host. Pending/failed/superseded claims are free
    # to coexist, which is what makes the race possible at all.
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_domain_verified_url "
               "ON domains(url) WHERE verify_status = 'verified'")
    # ...but a single organisation still can't stack duplicate claims.
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_domain_org_url "
               "ON domains(org_id, url)")


def downgrade():
    op.execute("DROP INDEX IF EXISTS uq_domain_org_url")
    op.execute("DROP INDEX IF EXISTS uq_domain_verified_url")
    # Restoring the global UNIQUE can only succeed if no host is duplicated;
    # collapse competing claims to the verified (or newest) one first.
    op.execute("""
        DELETE FROM domains d USING domains keep
         WHERE d.url = keep.url AND d.id <> keep.id
           AND (keep.verify_status = 'verified'
                OR (d.verify_status <> 'verified' AND keep.created_at > d.created_at))
    """)
    op.execute("ALTER TABLE domains ADD CONSTRAINT domains_url_key UNIQUE (url)")
    # the enum label is left in place: PostgreSQL cannot drop one, and leaving it
    # is harmless once no row uses it
