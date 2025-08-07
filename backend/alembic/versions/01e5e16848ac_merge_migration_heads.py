"""merge migration heads

Revision ID: 01e5e16848ac
Revises: f1a2b3c4d5e6, comprehensive_tracking
Create Date: 2025-08-07 16:38:43.645052

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '01e5e16848ac'
down_revision: Union[str, Sequence[str], None] = ('f1a2b3c4d5e6', 'comprehensive_tracking')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
