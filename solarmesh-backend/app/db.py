"""SQLAlchemy engine, session factory, and Base declarative class."""
import logging

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

logger = logging.getLogger("solarmesh.db")

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency yielding a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added after the original schema; SQLite (dev default) cannot ALTER ADD
# existing columns via create_all, so we add them manually when missing.
_COLUMN_MIGRATIONS: dict[str, list[tuple[str, str]]] = {
    "devices": [("status", "VARCHAR(16) NOT NULL DEFAULT 'online'")],
    "grid_edges": [("status", "VARCHAR(16) NOT NULL DEFAULT 'normal'")],
    "trades": [
        ("delivered_kwh", "NUMERIC(10, 4) NOT NULL DEFAULT 0"),
        ("energy_loss_kwh", "NUMERIC(10, 4) NOT NULL DEFAULT 0"),
        ("explanation", "JSON NULL"),
    ],
    "telemetry": [
        ("node_id", "VARCHAR(36) NULL"),
        ("production_kw", "FLOAT NOT NULL DEFAULT 0"),
        ("consumption_kw", "FLOAT NOT NULL DEFAULT 0"),
        ("battery_soc", "FLOAT NOT NULL DEFAULT 0"),
        ("battery_kw", "FLOAT NOT NULL DEFAULT 0"),
        ("voltage", "FLOAT NOT NULL DEFAULT 230"),
        ("current", "FLOAT NOT NULL DEFAULT 0"),
        ("power_kw", "FLOAT NOT NULL DEFAULT 0"),
    ],
}


def run_lightweight_migrations() -> None:
    """Create tables then add any missing columns (safe to call repeatedly)."""
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, columns in _COLUMN_MIGRATIONS.items():
            if table not in inspector.get_table_names():
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            for col_name, col_def in columns:
                if col_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
                    logger.info("Migration: added %s.%s", table, col_name)

