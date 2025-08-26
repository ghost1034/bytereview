"""Central mailbox support for email-based automations

Revision ID: 002_central_mailbox_support
Revises: 001_initial_schema
Create Date: 2024-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_central_mailbox_support'
down_revision = '001_initial_schema'
branch_labels = None
depends_on = None


def upgrade():
    # Add email field to integration_accounts for better sender matching
    op.add_column('integration_accounts', sa.Column('email', sa.String(255), nullable=True))
    
    # Add integration_account_id foreign key to automations table
    op.add_column('automations', sa.Column('integration_account_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_automations_integration_account_id',
        'automations', 'integration_accounts',
        ['integration_account_id'], ['id'],
        ondelete='SET NULL'
    )
    
    # Create central_mailbox_state table
    op.create_table('central_mailbox_state',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('mailbox_address', sa.String(255), nullable=False),
        sa.Column('last_history_id', sa.String(50), nullable=True),
        sa.Column('last_processed_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('created_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.TIMESTAMP(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.UniqueConstraint('mailbox_address', name='uq_central_mailbox_state_address')
    )
    
    # Insert initial record for our central mailbox
    op.execute("""
        INSERT INTO central_mailbox_state (mailbox_address) 
        VALUES ('document@cpaautomation.ai')
    """)


def downgrade():
    # Drop central_mailbox_state table
    op.drop_table('central_mailbox_state')
    
    # Remove integration_account_id foreign key from automations
    op.drop_constraint('fk_automations_integration_account_id', 'automations', type_='foreignkey')
    op.drop_column('automations', 'integration_account_id')
    
    # Remove email column from integration_accounts
    op.drop_column('integration_accounts', 'email')