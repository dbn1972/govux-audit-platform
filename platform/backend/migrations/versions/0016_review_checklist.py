"""Guided manual review: richer guidelines + persisted assessor decisions.

Two gaps closed together.

The review screen listed three hard-coded prompts in the frontend, and the
per-item answers were never sent anywhere — they only drove a local "can you
certify?" gate and were lost on navigation. Only the free-text note survived.
So an assessor's actual item-by-item findings, the evidence behind a legal
verdict, were being discarded. `review_items` persists them.

`guidelines` also only held title/plain_language/good_example, which is not
enough to review against: an assessor needs the failure mode, the advice, and a
failing example too. The UX4G v3.0.0 mastersheet carries all of it, so the extra
columns mirror that sheet.

Revision ID: 0016_review_checklist
Revises: 0015_steward_override
Create Date: 2026-08-14
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0016_review_checklist"
down_revision = "0015_steward_override"
branch_labels = None
depends_on = None

NEW_COLUMNS = [
    ("issue", sa.Text),              # what goes wrong, and how it shows up
    ("advice", sa.Text),             # what to do about it
    ("bad_example", sa.Text),        # good_example already exists for the pass case
    ("enforcement_level", sa.Text),  # Foundational | Optimizing | Advanced
    ("severity", sa.Text),           # Big | Medium | Small issue
    ("automation", sa.Text),         # automated | assisted | manual
    ("roles", sa.Text),              # Developer | Designer | Content ...
    ("source", sa.Text),             # UX4G Mastersheet v3.0.0 | WCAG 2.2 | ...
    ("reference", sa.Text),          # citation back to the normative document
]


def upgrade():
    for name, type_ in NEW_COLUMNS:
        op.add_column("guidelines", sa.Column(name, type_(), nullable=True))
    # The review screen's whole job is "show me what a human still has to judge",
    # and that is a filter on automation over hundreds of rows.
    op.create_index("ix_guidelines_automation", "guidelines", ["automation"])
    op.create_index("ix_guidelines_enforcement", "guidelines", ["enforcement_level"])

    op.create_table(
        "review_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("audit_id", UUID(as_uuid=True),
                  sa.ForeignKey("audits.id", ondelete="CASCADE"), nullable=False),
        sa.Column("guideline_id", sa.Text,
                  sa.ForeignKey("guidelines.id", ondelete="RESTRICT"), nullable=False),
        # pass | fail | not_applicable — the assessor's verdict on this guideline
        sa.Column("decision", sa.Text, nullable=False),
        sa.Column("note", sa.Text),
        sa.Column("decided_by", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        # one live answer per guideline per audit; re-deciding updates in place
        sa.UniqueConstraint("audit_id", "guideline_id", name="uq_review_item"),
        sa.CheckConstraint("decision IN ('pass','fail','not_applicable')",
                           name="chk_review_decision"),
    )
    op.create_index("ix_review_items_audit", "review_items", ["audit_id"])


def downgrade():
    op.drop_index("ix_review_items_audit", table_name="review_items")
    op.drop_table("review_items")
    op.drop_index("ix_guidelines_enforcement", table_name="guidelines")
    op.drop_index("ix_guidelines_automation", table_name="guidelines")
    for name, _ in NEW_COLUMNS:
        op.drop_column("guidelines", name)
