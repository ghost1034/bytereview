"""remove_automation_processed_messages_table

Revision ID: 5389ca72eb8a
Revises: b0c9cacb4fdf
Create Date: 2025-08-04 00:01:38.868187

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5389ca72eb8a'
down_revision: Union[str, Sequence[str], None] = 'b0c9cacb4fdf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Drop automation_processed_messages table if it exists
    op.drop_table('automation_processed_messages')


def downgrade() -> None:
    """Downgrade schema."""
    # Recreate automation_processed_messages table
    op.create_table('automation_processed_messages',
        sa.Column('automation_id', sa.UUID(), nullable=False),
        sa.Column('message_id', sa.String(length=255), nullable=False),
        sa.Column('processed_at', sa.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['automation_id'], ['automations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('automation_id', 'message_id')
    )
