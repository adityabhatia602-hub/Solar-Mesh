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

_INDEX_MIGRATIONS: list[str] = [
    # Telemetry: device history and time-series aggregations (biggest table)
    "CREATE INDEX IF NOT EXISTS ix_telemetry_device_recorded ON telemetry (device_id, recorded_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_telemetry_recorded_at_desc ON telemetry (recorded_at DESC)",
    # Orders: double auction matching engine, order book, user orders
    "CREATE INDEX IF NOT EXISTS ix_orders_status_side_price ON orders (status, side, price_per_kwh)",
    "CREATE INDEX IF NOT EXISTS ix_orders_user_created ON orders (user_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_orders_user_node_status ON orders (user_id, node_id, status)",
    # Trades: peer-to-peer user trade history
    "CREATE INDEX IF NOT EXISTS ix_trades_seller_created ON trades (seller_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_trades_buyer_created ON trades (buyer_id, created_at DESC)",
    # Ledger: financial transaction history per wallet
    "CREATE INDEX IF NOT EXISTS ix_ledger_wallet_created ON ledger_entries (wallet_id, created_at DESC)",
    # Grid events: congestion event monitoring by type and recency
    "CREATE INDEX IF NOT EXISTS ix_grid_events_type_created ON grid_events (event_type, created_at DESC)",
]


def run_lightweight_migrations() -> None:
    """Create tables, ensure missing columns, and apply performance indexes."""
    # Check whether base tables already exist (skip create_all if so).
    tables_exist = False
    try:
        with engine.begin() as conn:
            conn.execute(text("SELECT 1 FROM users LIMIT 1"))
            tables_exist = True
    except Exception:
        pass

    if not tables_exist:
        Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        # 1. Column migrations (needed for SQLite or older table versions)
        if settings.database_url.startswith("sqlite"):
            for table, columns in _COLUMN_MIGRATIONS.items():
                if table not in existing_tables:
                    continue
                existing = {c["name"] for c in inspector.get_columns(table)}
                for col_name, col_def in columns:
                    if col_name not in existing:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
                        logger.info("Migration: added %s.%s", table, col_name)

        # 2. Performance indexes (applied to both PostgreSQL and SQLite)
        for idx_sql in _INDEX_MIGRATIONS:
            try:
                conn.execute(text(idx_sql))
            except Exception as e:
                logger.warning("Index migration notice: %s (%s)", idx_sql, e)


