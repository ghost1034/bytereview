"""Add the native TaxAtlas data model.

Revision ID: 078_taxatlas_module
Revises: 077_pbc_storage_quotas
"""

from alembic import op

from models.db_models import Base
from taxatlas import models as taxatlas_models  # noqa: F401


revision = "078_taxatlas_module"
down_revision = "077_pbc_storage_quotas"
branch_labels = None
depends_on = None


_TABLE_ORDER = [
    "taxatlas_jurisdictions",
    "taxatlas_sources",
    "taxatlas_crawl_runs",
    "taxatlas_change_events",
    "taxatlas_regulations",
    "taxatlas_court_decisions",
    "taxatlas_tariffs",
    "taxatlas_tax_rates",
    "taxatlas_translations",
    "taxatlas_seed_runs",
    "taxatlas_api_keys",
    "taxatlas_watch_items",
    "taxatlas_notifications",
    "taxatlas_delivery_channels",
    "taxatlas_delivery_attempts",
]


def _tables():
    # Do not use Base.metadata.sorted_tables here. The platform metadata has a
    # few intentionally deferred cross-module FKs, while this migration only
    # needs a deterministic order for its own namespace.
    return [Base.metadata.tables[name] for name in _TABLE_ORDER]


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), tables=_tables(), checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()
    for table in reversed(_tables()):
        table.drop(bind=bind, checkfirst=True)
