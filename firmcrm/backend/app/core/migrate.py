"""Programmatic Alembic helpers: used by seed/tests and the readiness probe."""

from __future__ import annotations

from pathlib import Path

from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.engine import Engine

from alembic import command

BACKEND_DIR = Path(__file__).resolve().parents[2]


def alembic_config() -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return cfg


def upgrade_head() -> None:
    command.upgrade(alembic_config(), "head")


def head_revision() -> str | None:
    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def current_revision(engine: Engine) -> str | None:
    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()


def is_at_head(engine: Engine) -> bool:
    return current_revision(engine) == head_revision()


def drop_everything(engine: Engine) -> None:
    """Destructive: drop all app tables and alembic_version. Used only by seed --reset / tests."""
    import app.models  # noqa: F401
    from app.core.db import Base

    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
        return
    with engine.connect() as conn:
        if engine.dialect.name == "sqlite":
            # PRAGMA foreign_keys is ignored inside a transaction; issue it on the DBAPI connection before SA begins one.
            conn.connection.dbapi_connection.execute("PRAGMA foreign_keys=OFF")
        Base.metadata.drop_all(conn)
        conn.execute(text("DROP TABLE IF EXISTS alembic_version"))
        conn.commit()
        if engine.dialect.name == "sqlite":
            conn.connection.dbapi_connection.execute("PRAGMA foreign_keys=ON")
