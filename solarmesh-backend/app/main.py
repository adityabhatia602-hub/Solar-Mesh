"""SolarMesh backend application entrypoint."""
from __future__ import annotations

import asyncio
import contextlib
import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import settings
from app.db import SessionLocal, run_lightweight_migrations
from app.middleware import RequestLoggingMiddleware
from app.models import Base, SimulationState
from app.monitoring import alert_manager, metrics_collector
from app.routers import (
    analytics,
    auth,
    backups,
    grid,
    market,
    monitoring,
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
    # Initialize/migrate DB tables (safely catch errors on serverless cold starts).
    try:
        run_lightweight_migrations()
    except Exception as exc:
        logger.warning("Database migrations skipped or failed on startup: %s", exc)

    # Ensure the singleton simulation-state row exists.
    try:
        with SessionLocal() as db:
            if db.get(SimulationState, 1) is None:
                db.add(SimulationState(id=1, is_running=False, interval_seconds=settings.SIMULATION_INTERVAL_SECONDS))
                db.commit()
    except Exception as exc:
        logger.warning("SimulationState initialization check skipped: %s", exc)

    # Attach running event loop to telemetry event_bus
    with contextlib.suppress(Exception):
        telemetry.event_bus.set_loop(asyncio.get_running_loop())

    # Background matching engine task - only run on persistent servers, not serverless functions
    is_serverless = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
    worker_task = None
    stop_event = asyncio.Event()

    if not is_serverless:
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
        if worker_task:
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
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RequestLoggingMiddleware)

app.include_router(auth.router)
app.include_router(wallets.router)
app.include_router(grid.router)
app.include_router(market.router)
app.include_router(telemetry.router)
app.include_router(trades.router)
app.include_router(simulation.router)
app.include_router(analytics.router)
app.include_router(monitoring.router)
app.include_router(backups.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "req-unknown")
    forwarded = request.headers.get("x-forwarded-for")
    client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "127.0.0.1")

    err_entry = metrics_collector.record_error(
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status_code=500,
        exc=exc,
        client_ip=client_ip,
    )
    alert_manager.check_error_burst(err_entry)

    logger.exception("[%s] Unhandled exception on %s %s: %s", request_id, request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        headers={"X-Request-ID": request_id},
        content={
            "detail": f"Internal Server Error: {str(exc)}",
            "request_id": request_id,
            "error_type": type(exc).__name__,
        },
    )


@app.get("/health", tags=["ops"])
def health():
    db_ok = True
    try:
        with SessionLocal() as session:
            session.connection().execute(text("SELECT 1"))
    except Exception as e:
        db_ok = False
        alert_manager.trigger_alert(
            alert_type="DATABASE_DOWN",
            severity="CRITICAL",
            title="Database Health Check Failed",
            message=f"Health check failed to connect to database: {str(e)}",
        )

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
