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
    # Full reset of the schema this migration installed. DROP SCHEMA CASCADE also
    # removes alembic's own `alembic_version` table, so recreate it — otherwise
    # alembic can't record the downgrade and a later `upgrade` fails with
    # "relation alembic_version does not exist".
    op.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
    op.execute(
        "CREATE TABLE alembic_version ("
        "  version_num VARCHAR(32) NOT NULL,"
        "  CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num));")
    # Re-seed the current revision so alembic's own post-downgrade bookkeeping
    # (DELETE of this row) matches exactly one row instead of erroring with
    # "expected to match one row ... 0 found".
    op.execute("INSERT INTO alembic_version (version_num) VALUES ('0001_initial');")
