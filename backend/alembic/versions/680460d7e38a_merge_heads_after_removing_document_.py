"""Merge heads after removing document_order

Revision ID: 680460d7e38a
Revises: remove_document_order, rename_imports_completed_to_imports_ready
Create Date: 2025-08-08 14:12:34.123456

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '680460d7e38a'
down_revision = ('remove_document_order', 'rename_imports_completed_to_imports_ready')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass