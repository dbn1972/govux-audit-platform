"""Record a steward override as its own verification method.

A programme admin sometimes needs to vouch for a domain out of band — the
ministry owns it, but DNS sits with a third party and the paperwork is slower
than the audit. That override previously rode on `sso_mapping`, which
`verification.verify` treated as unconditional success, making it a bypass any
signed-in user could invoke rather than a steward action.

`steward_override` keeps it distinct, so "verified but never actually proven"
stays queryable:

    SELECT url FROM domains WHERE verify_method = 'steward_override';

Revision ID: 0015_steward_override
Revises: 0014_domain_claims
Create Date: 2026-08-13
"""
from alembic import op

revision = "0015_steward_override"
down_revision = "0014_domain_claims"
branch_labels = None
depends_on = None


def upgrade():
    # ALTER TYPE ... ADD VALUE can't run in the transaction that later uses it
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE verify_method ADD VALUE IF NOT EXISTS 'steward_override'")


def downgrade():
    # PostgreSQL cannot drop an enum label. Fold any override back to the value
    # it used to ride on, so the column stays valid if the label is ever removed.
    op.execute("UPDATE domains SET verify_method = 'sso_mapping' "
               "WHERE verify_method = 'steward_override'")
