"""standalone manual assessments

A review could only exist behind a completed engine run: review_items.audit_id
was NOT NULL and an audit needs a crawlable domain. So an organisation with
three registered domains could manually review exactly the one it had audited —
and a mobile app, which the engine cannot crawl at all, had no route in.

A manual assessment is the subject of a review without an engine run behind it:
a domain nobody has crawled yet, one the crawler cannot reach, or a native app.
It produces a compliance verdict and a completion rating, never a GovUX score —
that stays deterministic and engine-derived.

Revision ID: 0019_manual_assessments
Revises: 0018_notifications
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0019_manual_assessments"
down_revision = "0018_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "manual_assessments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("org_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("organisations.id"), nullable=False),
        # null for a mobile app: there is no domain to point at
        sa.Column("domain_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("domains.id", ondelete="SET NULL")),
        sa.Column("subject", sa.Text(), nullable=False),
        sa.Column("platform", sa.Text(), nullable=False, server_default="website"),
        sa.Column("status", sa.Text(), nullable=False, server_default="in_progress"),
        sa.Column("verdict", sa.Text()),
        sa.Column("notes", sa.Text()),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.Column("signed_off_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("platform IN ('website','app')", name="chk_ma_platform"),
        sa.CheckConstraint("status IN ('in_progress','signed_off')", name="chk_ma_status"),
    )
    op.create_index("idx_ma_org_time", "manual_assessments",
                    ["org_id", sa.text("created_at DESC")])

    # review_items now belongs to exactly one of the two subjects
    op.alter_column("review_items", "audit_id", nullable=True)
    op.add_column("review_items",
                  sa.Column("assessment_id", postgresql.UUID(as_uuid=True),
                            sa.ForeignKey("manual_assessments.id", ondelete="CASCADE")))
    op.drop_constraint("uq_review_item", "review_items", type_="unique")
    op.create_index("uq_review_item_audit", "review_items", ["audit_id", "guideline_id"],
                    unique=True, postgresql_where=sa.text("audit_id IS NOT NULL"))
    op.create_index("uq_review_item_assessment", "review_items",
                    ["assessment_id", "guideline_id"],
                    unique=True, postgresql_where=sa.text("assessment_id IS NOT NULL"))
    # exactly one owner, enforced in the database and not only in the router
    op.create_check_constraint(
        "chk_review_item_subject", "review_items",
        "(audit_id IS NOT NULL) <> (assessment_id IS NOT NULL)")


def downgrade() -> None:
    op.drop_constraint("chk_review_item_subject", "review_items", type_="check")
    op.drop_index("uq_review_item_assessment", table_name="review_items")
    op.drop_index("uq_review_item_audit", table_name="review_items")
    op.create_unique_constraint("uq_review_item", "review_items", ["audit_id", "guideline_id"])
    op.drop_column("review_items", "assessment_id")
    op.alter_column("review_items", "audit_id", nullable=False)
    op.drop_index("idx_ma_org_time", table_name="manual_assessments")
    op.drop_table("manual_assessments")
