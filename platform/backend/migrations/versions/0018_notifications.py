"""in-app notifications

The notify service could only email. A user who missed the mail — or whose
deployment has notification mail switched off — had no way to learn that an
audit finished, a score regressed, or an approval was decided. This gives those
events somewhere to live that the UI can read.

Revision ID: 0018_notifications
Revises: 0017_guideline_platform
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0018_notifications"
down_revision = "0017_guideline_platform"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True,
                  server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("body", sa.Text()),
        sa.Column("link", sa.Text()),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
    )
    # the bell's query: this user's newest first, unread counted
    op.create_index("idx_notif_user_time", "notifications",
                    ["user_id", sa.text("created_at DESC")])


def downgrade() -> None:
    op.drop_index("idx_notif_user_time", table_name="notifications")
    op.drop_table("notifications")
