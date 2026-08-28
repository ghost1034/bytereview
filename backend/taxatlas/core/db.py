"""TaxAtlas aliases for CPAAutomation's shared SQLAlchemy database."""

from models.db_models import Base


def SessionLocal():
    from core.database import db_config

    return db_config.SessionLocal()


def get_db():
    from core.database import get_db as platform_get_db

    yield from platform_get_db()

__all__ = ["Base", "SessionLocal", "get_db"]
