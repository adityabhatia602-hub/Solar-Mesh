"""Auth endpoint tests."""
from __future__ import annotations


def test_register_and_me(client):
    r = client.post("/api/auth/register", json={
        "email": "newuser@test.io", "password": "password123", "full_name": "New User",
    })
    assert r.status_code == 201, r.text
    tokens = r.json()
    assert "access_token" in tokens and "refresh_token" in tokens

    r2 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"})
    assert r2.status_code == 200
    assert r2.json()["email"] == "newuser@test.io"
    assert r2.json()["role"] == "prosumer"


def test_register_duplicate_email(client, test_user):
    r = client.post("/api/auth/register", json={
        "email": "trader@test.io", "password": "password123", "full_name": "Dup",
    })
    assert r.status_code == 409


def test_login_ok_and_bad(client, test_user):
    r = client.post("/api/auth/login-json", json={"email": "trader@test.io", "password": "password123"})
    assert r.status_code == 200
    assert "access_token" in r.json()

    r_bad = client.post("/api/auth/login-json", json={"email": "trader@test.io", "password": "wrong"})
    assert r_bad.status_code == 401


def test_me_requires_token(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_refresh_flow(client):
    r = client.post("/api/auth/register", json={
        "email": "refreshuser@test.io", "password": "password123", "full_name": "R U",
    })
    refresh_token = r.json()["refresh_token"]
    r2 = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert r2.status_code == 200
    assert "access_token" in r2.json()


def test_refresh_rejects_access_token(client):
    r = client.post("/api/auth/register", json={
        "email": "noRefresh@test.io", "password": "password123", "full_name": "X",
    })
    access = r.json()["access_token"]
    r2 = client.post("/api/auth/refresh", json={"refresh_token": access})
    assert r2.status_code == 401


def test_google_auth_mocked(client, monkeypatch):
    from google.oauth2 import id_token

    def mock_verify_oauth2_token(token, request, audience=None):
        if token == "valid-mock-google-token":
            return {
                "sub": "google-12345",
                "email": "googleuser@test.io",
                "name": "Google User",
                "picture": "https://example.com/pic.jpg",
            }
        raise ValueError("Invalid token")

    monkeypatch.setattr(id_token, "verify_oauth2_token", mock_verify_oauth2_token)

    # Test valid token creates new user & returns tokens
    res = client.post("/api/auth/google", json={"token": "valid-mock-google-token", "role": "consumer"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert "user" in data
    assert data["user"]["email"] == "googleuser@test.io"

    # Test invalid token returns 401
    bad_res = client.post("/api/auth/google", json={"token": "bad-token"})
    assert bad_res.status_code == 401
