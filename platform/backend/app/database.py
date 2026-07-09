"""SQLAlchemy engine + session dependency."""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

engine = create_engine(
    settings.database_url, pool_pre_ping=True, future=True,
    # explicit pool sizing (default 5+10 starves under load). Size against Postgres
    # max_connections / replica count; front with PgBouncer before scaling replicas.
    pool_size=settings.db_pool_size, max_overflow=settings.db_max_overflow,
    pool_timeout=settings.db_pool_timeout, pool_recycle=1800,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
