"""E-signature field schema v2 and resumable mark bundles.

Revision ID: 056_esign_field_parity_v2
Revises: 055_esign_p2_management
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "056_esign_field_parity_v2"
down_revision = "055_esign_p2_management"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("esign_recipients", sa.Column("draft_marks", postgresql.JSONB(), nullable=True))
    signature_type = postgresql.ENUM(name="esign_signature_type", create_type=False)
    op.add_column("esign_signature_records", sa.Column("initials_type", signature_type, nullable=True))
    op.add_column("esign_signature_records", sa.Column("initials_typed_font", sa.String(length=100), nullable=True))
    op.add_column("esign_signature_records", sa.Column("stamp_type", signature_type, nullable=True))
    op.add_column("esign_signature_records", sa.Column("stamp_image_gcs_object_name", sa.Text(), nullable=True))
    op.add_column("esign_signature_records", sa.Column("stamp_image_sha256", sa.String(length=64), nullable=True))

    # Only mutable authoring records are upgraded. Sent/completed envelope
    # JSON remains byte-for-byte unchanged and is handled by compatibility code.
    op.execute("""
        UPDATE esign_fields AS f
        SET properties = jsonb_set(
            CASE
                WHEN f.field_type = 'checkbox'
                  AND COALESCE(f.properties, '{}'::jsonb) ? 'selection_validation'
                  AND COALESCE(f.properties->>'data_label', '') <> ''
                THEN COALESCE(f.properties, '{}'::jsonb) || jsonb_build_object(
                    'selection_group', jsonb_build_object(
                        'id', f.properties->>'data_label',
                        'label', COALESCE(f.label, f.properties->>'data_label')
                    ) || f.properties->'selection_validation'
                ) - 'selection_validation'
                ELSE COALESCE(f.properties, '{}'::jsonb)
            END,
            '{schema_version}', '2'::jsonb, true
        )
        FROM esign_envelopes AS e
        WHERE f.envelope_id = e.id AND e.status = 'draft'
    """)
    op.execute("""
        UPDATE esign_template_fields
        SET properties = jsonb_set(
            CASE
                WHEN field_type = 'checkbox'
                  AND COALESCE(properties, '{}'::jsonb) ? 'selection_validation'
                  AND COALESCE(properties->>'data_label', '') <> ''
                THEN COALESCE(properties, '{}'::jsonb) || jsonb_build_object(
                    'selection_group', jsonb_build_object(
                        'id', properties->>'data_label',
                        'label', COALESCE(label, properties->>'data_label')
                    ) || properties->'selection_validation'
                ) - 'selection_validation'
                ELSE COALESCE(properties, '{}'::jsonb)
            END,
            '{schema_version}', '2'::jsonb, true
        )
    """)


def downgrade() -> None:
    op.drop_column("esign_signature_records", "stamp_image_sha256")
    op.drop_column("esign_signature_records", "stamp_image_gcs_object_name")
    op.drop_column("esign_signature_records", "stamp_type")
    op.drop_column("esign_signature_records", "initials_typed_font")
    op.drop_column("esign_signature_records", "initials_type")
    op.drop_column("esign_recipients", "draft_marks")
