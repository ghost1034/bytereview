"""add_source_files_integration_columns

Revision ID: 21606085958e
Revises: fdae8373b446
Create Date: 2025-07-31 14:16:07.270592

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '21606085958e'
down_revision: Union[str, Sequence[str], None] = '26e3a0f9327e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add integration columns to source_files
    op.add_column('source_files', sa.Column('source_type', sa.String(length=20), server_default='upload', nullable=False))
    op.add_column('source_files', sa.Column('external_id', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # Remove integration columns from source_files
    op.drop_column('source_files', 'external_id')
    op.drop_column('source_files', 'source_type')
