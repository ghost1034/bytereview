"""
Database configuration and connection management for PostgreSQL
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from models.db_models import Base
import logging

logger = logging.getLogger(__name__)

class DatabaseConfig:
    """Database configuration and session management"""
    
    def __init__(self):
        self.database_url = os.getenv("DATABASE_URL")
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable is required")
        
        # Create engine
        self.engine = create_engine(
            self.database_url,
            echo=os.getenv("SQL_ECHO", "false").lower() == "true",  # Enable SQL logging if needed
            pool_pre_ping=True,  # Verify connections before use
        )
        
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