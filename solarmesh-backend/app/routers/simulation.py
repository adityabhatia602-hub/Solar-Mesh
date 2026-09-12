"""Simulation control endpoints for the digital-twin demo."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user, require_admin
from app.models import User
from app.schemas import SimulationStatusOut, TickRequest
from app.services import simulation_service

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


@router.get("/status", response_model=SimulationStatusOut)
def simulation_status(db: Session = Depends(get_db)):
    """Public status so any logged-in dashboard can show the LIVE/OFF pill."""
    return simulation_service.get_status(db)


@router.post("/start", response_model=SimulationStatusOut)
async def start_simulation(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Start the global simulation loop (admin only)."""
    try:
        return await simulation_service.start(db, user.id)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/stop", response_model=SimulationStatusOut)
async def stop_simulation(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Stop the global simulation loop (admin only)."""
    try:
        return await simulation_service.stop(db)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/tick")
def run_ticks(
    payload: TickRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Run 1..20 synchronous simulation ticks (handy for demos without admin)."""
    results = []
    for _ in range(payload.ticks):
        results.append(simulation_service.run_tick(db))
    return {
        "ticks_run": len(results),
        "total_trades": sum(r["matched_trades"] for r in results),
        "total_volume_kwh": round(sum(r["volume_kwh"] for r in results), 4),
        "last": results[-1],
    }
