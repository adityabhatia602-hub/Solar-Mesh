"""Shared pytest fixtures: transactional DB session and API test client."""
from __future__ import annotations

import os

# Force SQLite for tests so local test runs never require a Postgres server.
# (Production Postgres config in .env is untouched; tests only set defaults if absent.)
os.environ.setdefault("DATABASE_URL", "sqlite:///./solarmesh_test.db")
os.environ.setdefault("SECRET_KEY", "test-secret")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import sessionmaker

from app.db import Base, engine, get_db
from app.main import app
from app.models import GridEdge, GridNode, User, UserRole
from app.routers.auth import login_limiter, register_limiter
from app.routers.wallets import deposit_self_limiter, transfer_limiter
from app.security import hash_password

TestSession = sessionmaker(bind=engine, autocommit=False, autoflush=False)


@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Reset in-memory rate limiters between tests to prevent test isolation leaks."""
    login_limiter.reset()
    register_limiter.reset()
    transfer_limiter.reset()
    deposit_self_limiter.reset()
    yield
    login_limiter.reset()
    register_limiter.reset()
    transfer_limiter.reset()
    deposit_self_limiter.reset()


@pytest.fixture(scope="session", autouse=True)
def _create_tables():
    Base.metadata.create_all(bind=engine)
    yield
    # Clean up the SQLite test database file after the session.
    try:
        if engine.url.get_backend_name() == "sqlite":
            engine.dispose()
            db_path = engine.url.database
            if db_path and "solarmesh_test" in db_path and os.path.exists(db_path):
                os.remove(db_path)
    except Exception:
        pass


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
