"""Telemetry ingestion, history, and the live WebSocket event stream."""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
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
    """Ingest a device reading (from the simulator or a real IoT device)."""
    from app.services.telemetry_service import save_reading

    device = db.get(Device, payload.device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    if device.owner_id != user.id and user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your device")

    # Legacy field names map onto the new instantaneous fields.
    production_kw = payload.production_kw if payload.production_kw is not None else (payload.production_kwh or 0.0)
    consumption_kw = payload.consumption_kw if payload.consumption_kw is not None else (payload.consumption_kwh or 0.0)
    battery_soc = payload.battery_soc
    battery_kw = payload.battery_kw if payload.battery_kw is not None else (
        (payload.battery_kwh or 0.0)
    )

    net = production_kw - consumption_kw
    power_kw = payload.power_kw if payload.power_kw else net

    reading = save_reading(
        db, device,
        production_kw=production_kw,
        consumption_kw=consumption_kw,
        battery_soc=battery_soc,
        battery_kw=battery_kw,
        voltage=payload.voltage,
        current=payload.current,
        power_kw=power_kw,
    )

    # Surplus/deficit auto-order detection also applies to manual ingestions.
    from app.services import market_service

    surplus = reading.power_kw
    if surplus > market_service.SURPLUS_THRESHOLD_KW:
        market_service.upsert_auto_order(
            db, device.owner_id, device.node_id, "offer",
            quantity_kwh=surplus, price_per_kwh=0.12, device_id=device.id,
        )
    elif -surplus > market_service.SURPLUS_THRESHOLD_KW:
        market_service.upsert_auto_order(
            db, device.owner_id, device.node_id, "bid",
            quantity_kwh=-surplus, price_per_kwh=0.30, device_id=device.id,
        )
    db.commit()

    update_node_congestion(db)
    db.commit()
    return reading


@router.get("/api/telemetry/latest", response_model=list[TelemetryOut])
def latest_telemetry(
    device_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Latest reading per device owned by user (admins see all devices)."""
    if device_id:
        device = db.get(Device, device_id)
        if device is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
        if device.owner_id != user.id and user.role.value != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your device")
        q = db.query(Telemetry).filter(Telemetry.device_id == device_id)
    else:
        if user.role.value != "admin":
            my_device_ids = [d.id for d in db.query(Device.id).filter(Device.owner_id == user.id).all()]
            if not my_device_ids:
                return []
            q = db.query(Telemetry).filter(Telemetry.device_id.in_(my_device_ids))
        else:
            q = db.query(Telemetry)

    rows = q.order_by(Telemetry.recorded_at.desc()).limit(limit * 4).all()
    seen: set[str] = set()
    latest: list[Telemetry] = []
    for row in rows:
        if row.device_id in seen:
            continue
        seen.add(row.device_id)
        latest.append(row)
        if len(latest) >= limit:
            break
    return latest


@router.get("/api/telemetry/device/{device_id}", response_model=list[TelemetryOut])
def device_history(
    device_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    device = db.get(Device, device_id)
    if device is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Device not found")
    if device.owner_id != user.id and user.role.value != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your device")
    return (
        db.query(Telemetry)
        .filter(Telemetry.device_id == device_id)
        .order_by(Telemetry.recorded_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.websocket("/ws/live")
async def live_feed(ws: WebSocket, token: str | None = None):
    """Live event stream: {'subscribe': '<channel>'} to join; events pushed as JSON.

    Channels: 'trades', 'orders', 'telemetry', 'grid', 'simulation', or a node/user id
    for localized updates.
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
