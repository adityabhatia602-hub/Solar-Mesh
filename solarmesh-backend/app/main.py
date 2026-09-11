"""SolarMesh backend application entrypoint."""
from __future__ import annotations

import asyncio
import contextlib

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import Base, SessionLocal, engine
from app.routers import auth, grid, market, telemetry, wallets
from app.services import market_service


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables (MVP)
    Base.metadata.create_all(bind=engine)

    # Attach running event loop to telemetry event_bus
    telemetry.event_bus.set_loop(asyncio.get_running_loop())

    # Background matching engine task
    stop_event = asyncio.Event()

    async def matching_worker():
        while not stop_event.is_set():
            try:
                await asyncio.sleep(settings.MATCH_INTERVAL_SECONDS)
                loop = asyncio.get_running_loop()

                def _do_match():
                    db = SessionLocal()
                    try:
                        market_service.run_matching(db)
                    except Exception:
                        db.rollback()
                    finally:
                        db.close()

                await loop.run_in_executor(None, _do_match)
            except asyncio.CancelledError:
                break
            except Exception:
                pass

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
        "P2P solar energy trading platform: register, fund a wallet, register devices "
        "on grid nodes, post offers/bids, and trade energy network-aware."
    ),
    version="0.1.0",
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
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(wallets.router)
app.include_router(grid.router)
app.include_router(market.router)
app.include_router(telemetry.router)


@app.get("/health", tags=["ops"])
def health():
    return {"status": "ok", "service": "solarmesh-backend"}

