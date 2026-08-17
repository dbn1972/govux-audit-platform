"""Platform applicability on guidelines (website / mobile app).

The UX4G self-health-check renders one platform at a time — its published
"Website" view is 354 of the mastersheet's 412, the other 58 being mobile-app
patterns (avatar menus, walkthrough screens, and app-only items inside shared
categories). Without this, a reviewer auditing a website is asked 58 questions
about app patterns that cannot apply to what they are looking at.

Two booleans rather than one enum: most guidelines apply to BOTH (285 of 412),
so "website or app" is not a partition and a single column would force a lie
for the majority.

Defaults are TRUE so that anything not yet classified keeps showing up. A
guideline wrongly shown costs a reviewer a moment; one wrongly hidden is a
compliance item silently dropped from an audit.

Revision ID: 0017_guideline_platform
Revises: 0016_review_checklist
Create Date: 2026-08-17
"""
import sqlalchemy as sa
from alembic import op

revision = "0017_guideline_platform"
down_revision = "0016_review_checklist"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("guidelines", sa.Column("applies_website", sa.Boolean(),
                                          nullable=False, server_default=sa.true()))
    op.add_column("guidelines", sa.Column("applies_app", sa.Boolean(),
                                          nullable=False, server_default=sa.true()))
    # The review checklist filters on these on every load.
    op.create_index("ix_guidelines_platform", "guidelines",
                    ["applies_website", "applies_app"])


def downgrade():
    op.drop_index("ix_guidelines_platform", table_name="guidelines")
    op.drop_column("guidelines", "applies_app")
    op.drop_column("guidelines", "applies_website")
