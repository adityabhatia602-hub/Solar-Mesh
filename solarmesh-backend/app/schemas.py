"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.models import OrderSide, OrderStatus, TradeStatus


# ---------------------------------------------------------------- auth

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    role: Literal["prosumer", "consumer"] = "prosumer"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------- wallet

class WalletOut(BaseModel):
    id: str
    user_id: str
    balance: float
    reserved: float
    available: float
    energy_kwh_sold: float
    energy_kwh_bought: float

    model_config = {"from_attributes": True}



class LedgerEntryOut(BaseModel):
    id: str
    wallet_id: str
    entry_type: str
    amount: float
    balance_after: float
    reference: str | None = None
    memo: str | None = None

    model_config = {"from_attributes": True}


class DepositRequest(BaseModel):
    amount: float = Field(gt=0, le=100000)


# ---------------------------------------------------------------- devices / grid

class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    node_id: str
    device_type: Literal["solar_panel", "battery", "meter"] = "solar_panel"
    capacity_kwh: float = Field(ge=0, le=10000)


class DeviceOut(BaseModel):
    id: str
    owner_id: str
    node_id: str
    name: str
    device_type: str
    capacity_kwh: float
    is_active: bool

    model_config = {"from_attributes": True}


class GridNodeOut(BaseModel):
    id: str
    code: str
    name: str
    node_type: str
    region: str
    congestion_level: float

    model_config = {"from_attributes": True}


class GridEdgeOut(BaseModel):
    id: str
    from_node_id: str
    to_node_id: str
    capacity_kw: float
    load_kw: float
    loss_factor: float
    utilization: float
    is_active: bool

    model_config = {"from_attributes": True}


class RouteQuote(BaseModel):
    from_node_id: str
    to_node_id: str
    feasible: bool
    path_node_ids: list[str] = []
    path_loss: float = 0.0
    congestion_penalty: float = 0.0
    total_network_cost_per_kwh: float = 0.0


# ---------------------------------------------------------------- market

class OrderCreate(BaseModel):
    side: Literal["offer", "bid"]
    price_per_kwh: float = Field(gt=0, le=1000)
    quantity_kwh: float = Field(gt=0, le=10000)
    node_id: str
    expires_in_hours: int = Field(default=48, ge=1, le=168)


class OrderOut(BaseModel):
    id: str
    side: str
    user_id: str
    node_id: str
    price_per_kwh: float
    quantity_kwh: float
    filled_kwh: float
    remaining_kwh: float
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderBookLevel(BaseModel):
    price_per_kwh: float
    quantity_kwh: float
    order_count: int


class OrderBookOut(BaseModel):
    bids: list[OrderBookLevel]
    offers: list[OrderBookLevel]
    spread: float
    midpoint: float


class TradeOut(BaseModel):
    id: str
    offer_id: str
    bid_id: str
    seller_id: str
    buyer_id: str
    quantity_kwh: float
    price_per_kwh: float
    network_cost_per_kwh: float
    total_amount: float
    path_nodes: list[str] = Field(alias="path_node_list")
    status: str
    created_at: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}


class MatchResult(BaseModel):
    matched_trades: int
    total_volume_kwh: float
    total_value: float
    trades: list[TradeOut]


# ---------------------------------------------------------------- telemetry

class TelemetryIn(BaseModel):
    device_id: str
    production_kwh: float = Field(ge=0)
    consumption_kwh: float = Field(ge=0)
    battery_kwh: float = Field(ge=0)


class TelemetryOut(BaseModel):
    id: str
    device_id: str
    production_kwh: float
    consumption_kwh: float
    battery_kwh: float
    recorded_at: datetime

    model_config = {"from_attributes": True}
