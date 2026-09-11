"""Integration tests for CORS preflight and live WebSocket stream."""
from __future__ import annotations

import json


def test_cors_headers(client):
    # Test preflight OPTIONS request from localhost:5173
    response = client.options(
        "/api/auth/me",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_websocket_live_feed(client):
    with client.websocket_connect("/ws/live") as websocket:
        websocket.send_text(json.dumps({"action": "subscribe", "channel": "orders"}))
        data = websocket.receive_json()
        assert data == {"ok": True, "subscribed": "orders"}

        websocket.send_text(json.dumps({"action": "unsubscribe", "channel": "orders"}))
        data = websocket.receive_json()
        assert data == {"ok": True, "unsubscribed": "orders"}
