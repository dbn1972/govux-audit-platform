"""initial schema — loads db/schema.sql

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-07
"""
import os
from alembic import op

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

SCHEMA = os.path.join(os.path.dirname(__file__), "..", "..", "..", "db", "schema.sql")


def upgrade():
    with open(os.path.abspath(SCHEMA), encoding="utf-8") as f:
        op.execute(f.read())


def downgrade():
    op.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
