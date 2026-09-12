"""SolarMesh backend application entrypoint."""
from __future__ import annotations

import asyncio
import contextlib
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.db import SessionLocal, run_lightweight_migrations
from app.models import Base, SimulationState
from app.routers import (
    analytics,
    auth,
    grid,
    market,
    simulation,
    telemetry,
    trades,
    wallets,
)
from app.services import market_service, simulation_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("solarmesh")


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize/migrate DB tables (MVP: lightweight ALTERs for SQLite).
    run_lightweight_migrations()

    # Ensure the singleton simulation-state row exists.
    db = SessionLocal()
    try:
        if db.get(SimulationState, 1) is None:
            db.add(SimulationState(id=1, is_running=False, interval_seconds=settings.SIMULATION_INTERVAL_SECONDS))
            db.commit()
        sim_running = db.get(SimulationState, 1).is_running
    finally:
        db.close()

    # Attach running event loop to telemetry event_bus
    telemetry.event_bus.set_loop(asyncio.get_running_loop())

    # Background matching engine task (runs even when the demo sim is off).
    stop_event = asyncio.Event()

    async def matching_worker():
        while not stop_event.is_set():
            try:
                await asyncio.sleep(settings.MATCH_INTERVAL_SECONDS)
                loop = asyncio.get_running_loop()

                def _do_match():
                    session = SessionLocal()
                    try:
                        market_service.run_matching(session)
                    except Exception:
                        session.rollback()
                    finally:
                        session.close()

                await loop.run_in_executor(None, _do_match)
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Matching worker iteration failed")

    worker_task = asyncio.create_task(matching_worker())
    try:
        yield
    finally:
        stop_event.set()
        worker_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker_task


app = FastAPI(
    title="SolarMesh API",
    description=(
        "P2P solar energy trading platform with a simulated digital-twin grid: "
        "register, fund a wallet, register devices on grid nodes, and trade energy "
        "network-aware (Dijkstra routing, line losses, congestion, settlement)."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(wallets.router)
app.include_router(grid.router)
app.include_router(market.router)
app.include_router(telemetry.router)
app.include_router(trades.router)
app.include_router(simulation.router)
app.include_router(analytics.router)


@app.get("/health", tags=["ops"])
def health():
    db_ok = True
    try:
        with SessionLocal() as session:
            session.connection().execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    sim_running = False
    try:
        with SessionLocal() as session:
            state = session.get(SimulationState, 1)
            sim_running = bool(state.is_running) if state else False
    except Exception:
        pass

    return {
        "status": "ok" if db_ok else "degraded",
        "service": "solarmesh-backend",
        "database": "connected" if db_ok else "error",
        "simulation": "running" if sim_running else "stopped",
    }
