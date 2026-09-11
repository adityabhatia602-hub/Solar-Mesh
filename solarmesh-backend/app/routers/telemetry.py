"""Telemetry ingestion and live WebSocket event stream."""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import Device, Telemetry, User
from app.schemas import TelemetryIn, TelemetryOut
from app.security import decode_token
from app.services.grid_service import update_node_congestion

router = APIRouter(tags=["telemetry"])


class EventBus:
    """In-process pub/sub for live market events (per-hackathon MVP; swap for Redis in prod)."""

    def __init__(self) -> None:
        self._subscribers: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def subscribe(self, channel: str, ws: WebSocket) -> None:
        async with self._lock:
            self._subscribers[channel].add(ws)

    async def unsubscribe(self, channel: str, ws: WebSocket) -> None:
        async with self._lock:
            self._subscribers[channel].discard(ws)

    async def publish(self, channel: str, event: dict) -> None:
        async with self._lock:
            sockets = list(self._subscribers.get(channel, set()))
        for ws in sockets:
            try:
                await ws.send_text(json.dumps(event, default=str))
            except Exception:
                await self.unsubscribe(channel, ws)

    def publish_threadsafe(self, channel: str, event: dict) -> None:
        if self._loop and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(self.publish(channel, event), self._loop)
        else:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self.publish(channel, event))
            except RuntimeError:
                pass


event_bus = EventBus()


@router.post("/api/telemetry", response_model=TelemetryOut, status_code=status.HTTP_201_CREATED)
def ingest_telemetry(payload: TelemetryIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    device = db.get(Device, payload.device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    if device.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your device")

    reading = Telemetry(
        device_id=device.id,
        production_kwh=payload.production_kwh,
        consumption_kwh=payload.consumption_kwh,
        battery_kwh=payload.battery_kwh,
    )
    db.add(reading)
    update_node_congestion(db)
    db.commit()
    db.refresh(reading)

    reading_dict = reading.to_dict()
    event_bus.publish_threadsafe("telemetry", {"type": "telemetry", "data": reading_dict})
    event_bus.publish_threadsafe(f"node:{device.node_id}", {"type": "telemetry", "data": reading_dict})
    event_bus.publish_threadsafe("grid", {"type": "grid_update", "node_id": device.node_id})

    return reading


@router.get("/api/telemetry/device/{device_id}", response_model=list[TelemetryOut])
def device_history(
    device_id: str,
    limit: int = 100,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    if device.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your device")
    return (
        db.query(Telemetry)
        .filter(Telemetry.device_id == device_id)
        .order_by(Telemetry.recorded_at.desc())
        .limit(limit)
        .all()
    )


@router.websocket("/ws/live")
async def live_feed(ws: WebSocket, token: str | None = None):
    """Live event stream: {'subscribe': '<channel>'} to join; events pushed as JSON.

    Channels: 'trades', 'orders', 'telemetry', 'grid', or a node id for localized updates.
    """
    user_id = None
    if token:
        payload = decode_token(token)
        if not payload or payload.get("type") != "access":
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            return
        user_id = payload.get("sub")

    await ws.accept()
    channels: set[str] = set()
    try:
        while True:
            # Wait for subscribe/unsubscribe commands; publish happens via bus
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_text(json.dumps({"error": "invalid json"}))
                continue
            action = msg.get("action")
            channel = msg.get("channel", "")
            if action == "subscribe" and channel:
                channels.add(channel)
                await event_bus.subscribe(channel, ws)
                await ws.send_text(json.dumps({"ok": True, "subscribed": channel}))
            elif action == "unsubscribe" and channel:
                channels.discard(channel)
                await event_bus.unsubscribe(channel, ws)
                await ws.send_text(json.dumps({"ok": True, "unsubscribed": channel}))
            else:
                await ws.send_text(json.dumps({"error": "unknown action"}))
    except WebSocketDisconnect:
        pass
    finally:
        for ch in channels:
            await event_bus.unsubscribe(ch, ws)

