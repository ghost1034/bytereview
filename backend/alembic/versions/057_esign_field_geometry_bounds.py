"""Enforce aggregate e-signature field page bounds.

Revision ID: 057_esign_field_geometry_bounds
Revises: 056_esign_field_parity_v2
"""

from alembic import op


revision = "057_esign_field_geometry_bounds"
down_revision = "056_esign_field_parity_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NOT VALID preserves immutable historical envelope records if an older
    # code path admitted invalid geometry, while PostgreSQL still enforces the
    # constraints for every new or updated row. Application validation rejects
    # invalid legacy template fields before publishing or materialization.
    op.execute("""
        ALTER TABLE esign_fields
        ADD CONSTRAINT ck_esign_fields_horizontal_bounds
        CHECK (pos_x + width <= 1) NOT VALID
    """)
    op.execute("""
        ALTER TABLE esign_fields
        ADD CONSTRAINT ck_esign_fields_vertical_bounds
        CHECK (pos_y + height <= 1) NOT VALID
    """)
    op.execute("""
        ALTER TABLE esign_template_fields
        ADD CONSTRAINT ck_esign_template_fields_horizontal_bounds
        CHECK (pos_x + width <= 1) NOT VALID
    """)
    op.execute("""
        ALTER TABLE esign_template_fields
        ADD CONSTRAINT ck_esign_template_fields_vertical_bounds
        CHECK (pos_y + height <= 1) NOT VALID
    """)


def downgrade() -> None:
    op.drop_constraint(
        "ck_esign_template_fields_vertical_bounds",
        "esign_template_fields",
        type_="check",
    )
    op.drop_constraint(
        "ck_esign_template_fields_horizontal_bounds",
        "esign_template_fields",
        type_="check",
    )
    op.drop_constraint(
        "ck_esign_fields_vertical_bounds",
        "esign_fields",
        type_="check",
    )
    op.drop_constraint(
        "ck_esign_fields_horizontal_bounds",
        "esign_fields",
        type_="check",
    )
