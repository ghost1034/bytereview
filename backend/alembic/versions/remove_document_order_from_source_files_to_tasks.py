"""remove document_order from source_files_to_tasks

Revision ID: remove_document_order
Revises: 7292d6b295c6
Create Date: 2025-08-12

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'remove_document_order'
down_revision = '7292d6b295c6'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('source_files_to_tasks') as batch_op:
        try:
            batch_op.drop_column('document_order')
        except Exception:
            # Column may already be dropped
            pass


def downgrade():
    with op.batch_alter_table('source_files_to_tasks') as batch_op:
        batch_op.add_column(sa.Column('document_order', sa.Integer(), nullable=False, server_default='0'))
        batch_op.alter_column('document_order', server_default=None)