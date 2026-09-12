"""Simulation loop: a single controllable background task driving the digital twin.

The loop periodically: generates telemetry → saves readings → detects
surplus/deficit → creates/refreshes auto orders → runs the matching engine →
broadcasts WebSocket events. Only one loop instance can ever run (guarded by an
asyncio task handle plus a DB flag) and it stops cleanly.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import SimulationState
from app.services import market_service, telemetry_service
from app.services.grid_service import record_grid_events, update_node_congestion
from app.routers.telemetry import event_bus

logger = logging.getLogger("solarmesh.simulation")

_task: asyncio.Task | None = None
_stop_event: asyncio.Event | None = None


class SimulationError(Exception):
    pass


def _get_state(db: Session) -> SimulationState:
    state = db.get(SimulationState, 1)
    if state is None:
        state = SimulationState(id=1, is_running=False, interval_seconds=settings.SIMULATION_INTERVAL_SECONDS)
        db.add(state)
        db.flush()
    return state


def get_status(db: Session) -> dict:
    state = _get_state(db)
    status = state.to_dict()
    status["loop_alive"] = _task is not None and not _task.done()
    return status


async def start(db: Session, user_id: str) -> dict:
    """Start the global simulation loop (idempotent)."""
    global _task, _stop_event

    if _task is not None and not _task.done():
        state = _get_state(db)
        state.is_running = True
        db.commit()
        return get_status(db)

    state = _get_state(db)
    state.is_running = True
    state.started_at = datetime.now(timezone.utc)
    state.started_by = user_id
    db.commit()

    _stop_event = asyncio.Event()
    interval = state.interval_seconds
    _task = asyncio.create_task(_simulation_loop(interval, _stop_event))
    logger.info("Simulation started by %s (interval %.1fs)", user_id, interval)
    event_bus.publish_threadsafe("simulation", {"type": "simulation_status", "data": {"is_running": True}})
    return get_status(db)


async def stop(db: Session) -> dict:
    """Stop the global simulation loop (idempotent)."""
    global _task, _stop_event

    state = _get_state(db)
    state.is_running = False
    db.commit()

    if _stop_event is not None:
        _stop_event.set()
    if _task is not None:
        _task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await _task
    _task = None
    _stop_event = None
    logger.info("Simulation stopped")
    event_bus.publish_threadsafe("simulation", {"type": "simulation_status", "data": {"is_running": False}})
    return get_status(db)


def run_tick(db: Session) -> dict:
    """A single synchronous simulation step, usable standalone or from the loop."""
    state = _get_state(db)
    interval = state.interval_seconds

    readings = telemetry_service.generate_and_record(db, tick_seconds=interval)
    match_result = market_service.run_matching(db)

    state.tick_count += 1
    state.last_tick_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "tick": state.tick_count,
        "readings": len(readings),
        "matched_trades": match_result["matched_trades"],
        "volume_kwh": match_result["total_volume_kwh"],
        "trades": match_result.get("trades", []),
    }


async def _simulation_loop(interval_seconds: float, stop_event: asyncio.Event) -> None:
    """Background loop; each tick runs in a thread so SQLite never blocks the event loop."""
    loop = asyncio.get_running_loop()
    while not stop_event.is_set():
        try:
            await loop.run_in_executor(None, _tick_once, interval_seconds)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Simulation tick failed; continuing")
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval_seconds)
        except asyncio.TimeoutError:
            pass
    logger.info("Simulation loop exited cleanly")


def _tick_once(interval_seconds: float) -> None:
    db = SessionLocal()
    try:
        result = run_tick(db)
        logger.info(
            "Tick %s: %d readings, %d trades, %.2f kWh",
            result["tick"], result["readings"], result["matched_trades"], result["volume_kwh"],
        )
    finally:
        db.close()


def set_interval(db: Session, seconds: float) -> dict:
    if seconds < 2 or seconds > 120:
        raise SimulationError("Interval must be between 2 and 120 seconds")
    state = _get_state(db)
    state.interval_seconds = seconds
    db.commit()
    return get_status(db)
