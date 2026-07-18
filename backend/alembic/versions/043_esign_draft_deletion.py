"""Allow draft envelopes to be hard-deleted.

esign_events rows block envelope deletion (FK RESTRICT) and are themselves
protected by an append-only trigger, so envelopes could never be deleted —
including drafts, which have no signatures, consents, or legal retention
requirement. Relax the trigger so DELETE is permitted only while the parent
envelope is still in 'draft' status; UPDATE stays blocked unconditionally,
and events of any envelope that has left draft remain immutable.

Revision ID: 043_esign_draft_deletion
Revises: 042_connector_tables
"""

from typing import Sequence, Union

from alembic import op

revision: str = "043_esign_draft_deletion"
down_revision: Union[str, Sequence[str], None] = "042_connector_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DRAFT_AWARE_FUNCTION = """
CREATE OR REPLACE FUNCTION esign_events_block_mutation()
RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' AND EXISTS (
        SELECT 1 FROM esign_envelopes e
        WHERE e.id = OLD.envelope_id AND e.status = 'draft'
    ) THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'esign_events is append-only: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
"""

ORIGINAL_FUNCTION = """
CREATE OR REPLACE FUNCTION esign_events_block_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'esign_events is append-only: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
"""


def upgrade() -> None:
    op.execute(DRAFT_AWARE_FUNCTION)


def downgrade() -> None:
    op.execute(ORIGINAL_FUNCTION)
