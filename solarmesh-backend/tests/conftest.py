"""Shared pytest fixtures: transactional DB session and API test client."""
from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("POSTGRES_DB", "solarmesh_test")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.db import Base, engine, get_db
from app.main import app
from app.models import GridEdge, GridNode, User, UserRole
from app.security import hash_password

TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


@pytest.fixture(scope="session", autouse=True)
def _create_tables():
    # Ensure the test database exists (against the default 'postgres' DB), then create tables.
    admin_url = (
        f"postgresql+psycopg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}"
        f"@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/postgres"
    )
    from sqlalchemy import create_engine

    admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin_engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :d"), {"d": settings.POSTGRES_DB}
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{settings.POSTGRES_DB}"'))
    admin_engine.dispose()

    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture()
def db_session():
    """Each test runs in a transaction that is rolled back afterwards."""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestSession(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def grid_nodes(db_session):
    n1 = GridNode(code=f"T{n1_code}" if False else "TN1", name="Test Node 1", node_type="household", region="test")
    n2 = GridNode(code="TN2", name="Test Node 2", node_type="household", region="test")
    n3 = GridNode(code="TN3", name="Test Node 3", node_type="household", region="test")
    db_session.add_all([n1, n2, n3])
    db_session.flush()
    db_session.add_all([
        GridEdge(from_node_id=n1.id, to_node_id=n2.id, capacity_kw=50, loss_factor=0.02, load_kw=0),
        GridEdge(from_node_id=n2.id, to_node_id=n1.id, capacity_kw=50, loss_factor=0.02, load_kw=0),
        GridEdge(from_node_id=n2.id, to_node_id=n3.id, capacity_kw=50, loss_factor=0.03, load_kw=0),
        GridEdge(from_node_id=n3.id, to_node_id=n2.id, capacity_kw=50, loss_factor=0.03, load_kw=0),
    ])
    db_session.flush()
    return {"n1": n1, "n2": n2, "n3": n3}


@pytest.fixture()
def test_user(db_session):
    u = User(email="trader@test.io", full_name="Test Trader",
             hashed_password=hash_password("password123"), role=UserRole.PROSUMER)
    db_session.add(u)
    db_session.flush()
    return u
