"""
Database configuration and connection management for PostgreSQL
"""
import os
import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from models.db_models import Base
from models import inkwise_models  # noqa: F401
from models import tasklytic  # noqa: F401
from models import pbc  # noqa: F401
from taxatlas import models as taxatlas_models  # noqa: F401

from core.runtime import is_local

logger = logging.getLogger(__name__)


def _integer_setting(name: str, default: int, *, minimum: int = 0) -> int:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if value < minimum:
        raise ValueError(f"{name} must be at least {minimum}")
    return value


class DatabaseConfig:
    """Database configuration and session management"""
    
    def __init__(self):
        self.database_url = os.getenv("DATABASE_URL")
        if not self.database_url:
            if not is_local():
                raise ValueError("DATABASE_URL environment variable is required outside local development")
            self.database_url = "postgresql://bytereview:bytereview@127.0.0.1:5432/bytereview_dev"
            logger.info("DATABASE_URL not set; using the local development database")

        self.pool_size = _integer_setting("DB_POOL_SIZE", 5, minimum=1)
        self.max_overflow = _integer_setting("DB_MAX_OVERFLOW", 10)
        self.pool_timeout_seconds = _integer_setting("DB_POOL_TIMEOUT_SECONDS", 5, minimum=1)
        self.pool_recycle_seconds = _integer_setting("DB_POOL_RECYCLE_SECONDS", 1800, minimum=1)

        # Create engine
        engine_options = {
            "echo": os.getenv("SQL_ECHO", "false").lower() == "true",
            "pool_pre_ping": True,
        }
        if not self.database_url.startswith("sqlite"):
            engine_options.update({
                "pool_size": self.pool_size,
                "max_overflow": self.max_overflow,
                "pool_timeout": self.pool_timeout_seconds,
                "pool_recycle": self.pool_recycle_seconds,
            })
            logger.info(
                "Database pool configured: size=%s, max_overflow=%s, timeout=%ss, recycle=%ss",
                self.pool_size,
                self.max_overflow,
                self.pool_timeout_seconds,
                self.pool_recycle_seconds,
            )
        self.engine = create_engine(self.database_url, **engine_options)

        # Create session factory
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
    
    def create_tables(self):
        """Create all tables in the database"""
        try:
            Base.metadata.create_all(bind=self.engine)
            logger.info("Database tables created successfully")
        except Exception as e:
            logger.error(f"Error creating database tables: {e}")
            raise
    
    def get_session(self) -> Session:
        """Get a database session"""
        return self.SessionLocal()

# Global database instance
db_config = DatabaseConfig()

def get_db() -> Session:
    """Dependency to get database session for FastAPI"""
    db = db_config.get_session()
    try:
        yield db
    finally:
        db.close()

def init_database():
    """Initialize database tables"""
    try:
        db_config.create_tables()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
