"""Grid topology and routing endpoints + device registration."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import Device, GridEdge, GridNode, User
from app.schemas import DeviceCreate, DeviceOut, GridEdgeOut, GridNodeOut, RouteQuote
from app.services.grid_service import find_cheapest_route

router = APIRouter(prefix="/api/grid", tags=["grid"])


# ---------------------------------------------------------------- devices

@router.post("/devices", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
def register_device(payload: DeviceCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    node = db.get(GridNode, payload.node_id)
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grid node not found")
    device = Device(
        owner_id=user.id,
        node_id=payload.node_id,
        name=payload.name,
        device_type=payload.device_type,
        capacity_kwh=payload.capacity_kwh,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.get("/devices", response_model=list[DeviceOut])
def list_my_devices(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Device).filter(Device.owner_id == user.id).all()


# ---------------------------------------------------------------- topology

@router.get("/nodes", response_model=list[GridNodeOut])
def list_nodes(region: str | None = None, db: Session = Depends(get_db)):
    q = db.query(GridNode)
    if region:
        q = q.filter(GridNode.region == region)
    return q.order_by(GridNode.code).all()


@router.get("/nodes/{node_id}", response_model=GridNodeOut)
def get_node(node_id: str, db: Session = Depends(get_db)):
    node = db.get(GridNode, node_id)
    if node is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grid node not found")
    return node


@router.get("/edges", response_model=list[GridEdgeOut])
def list_edges(db: Session = Depends(get_db)):
    return db.query(GridEdge).all()


@router.get("/route", response_model=RouteQuote)
@router.get("/route-quote", response_model=RouteQuote)
def quote_route(
    from_node: str | None = None,
    to_node: str | None = None,
    from_node_id: str | None = None,
    to_node_id: str | None = None,
    quantity_kw: float = 0.0,
    db: Session = Depends(get_db),
):
    """Cheapest delivery path and network cost per kWh between two nodes."""
    src = from_node or from_node_id
    dst = to_node or to_node_id
    if not src or not dst:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and destination node parameters (from_node, to_node) are required",
        )
    return find_cheapest_route(db, src, dst, required_kw=quantity_kw)
