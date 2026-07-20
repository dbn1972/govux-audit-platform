"""add 'insufficient_evidence' to the audit_status enum.

Revision ID: 0007_insufficient_evidence
Revises: 0006_fk_indexes
Create Date: 2026-07-16

Coverage-confidence gate: when the audit engine cannot capture the home page
(timeout / WAF / geo-block), the worker marks the audit `insufficient_evidence`
instead of emitting a GovUX band from meaningless filler categories. This adds
the new enum value used for that state.

Additive + idempotent (ADD VALUE IF NOT EXISTS). PostgreSQL cannot drop an enum
value in place, so downgrade is a no-op — the value is harmless if unused, and a
full `downgrade base` recreates the type from 0001 without it.
"""
from alembic import op

revision = "0007_insufficient_evidence"
down_revision = "0006_fk_indexes"
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE audit_status ADD VALUE IF NOT EXISTS 'insufficient_evidence';")


def downgrade():
    # Enum values cannot be removed in place in PostgreSQL; intentional no-op.
    pass
