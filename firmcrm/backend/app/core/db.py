from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def _make_engine():
    settings = get_settings()
    kwargs: dict = {"pool_pre_ping": True}
    if settings.is_sqlite:
        # isolation_level=None disables pysqlite's implicit BEGIN so SAVEPOINT (begin_nested) works correctly.
        # See SQLAlchemy docs: "Serializable isolation / Savepoints / Transactional DDL" for pysqlite.
        kwargs["connect_args"] = {"check_same_thread": False, "isolation_level": None}
    eng = create_engine(settings.database_url, **kwargs)
    if settings.is_sqlite:

        @event.listens_for(eng, "connect")
        def _sqlite_connect(dbapi_conn, _):  # pragma: no cover
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.execute("PRAGMA journal_mode=WAL")
            cur.close()

        @event.listens_for(eng, "begin")
        def _sqlite_begin(conn):  # pragma: no cover
            conn.exec_driver_sql("BEGIN")

    return eng


engine = _make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
