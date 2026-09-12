"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

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
    token: str | None = None
    user: UserOut | None = None


class GoogleAuthRequest(BaseModel):
    token: str
    role: Literal["prosumer", "consumer"] = "consumer"


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


# ---------------------------------------------------------------- simulation

class SimulationStatusOut(BaseModel):
    is_running: bool
    interval_seconds: float
    tick_count: int
    last_tick_at: datetime | None = None
    started_at: datetime | None = None
    loop_alive: bool = False


class TickRequest(BaseModel):
    ticks: int = Field(default=1, ge=1, le=20)


class DepositRequest(BaseModel):
    amount: float = Field(gt=0, le=100000)


class TransferRequest(BaseModel):
    recipient_email: EmailStr
    amount: float = Field(gt=0, le=100000)
    memo: str | None = Field(default=None, max_length=255)


# ---------------------------------------------------------------- devices / grid

class DeviceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    node_id: str
    device_type: Literal["solar_panel", "battery", "meter"] = "solar_panel"
    capacity_kwh: float = Field(gt=0, le=10000)


class DeviceOut(BaseModel):
    id: str
    owner_id: str
    node_id: str
    name: str
    device_type: str
    capacity_kwh: float
    status: str = "online"
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
    status: str = "normal"
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
    min_available_capacity_kw: float = 0.0
    required_kw: float = 0.0
    loss_factor: float = 0.0
    rejected_reason: str | None = None


# ---------------------------------------------------------------- market

class OrderCreate(BaseModel):
    side: Literal["offer", "bid"]
    price_per_kwh: float = Field(gt=0, le=1000)
    quantity_kwh: float = Field(gt=0, le=10000)
    node_id: str
    device_id: str | None = None
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
    delivered_kwh: float = 0.0
    energy_loss_kwh: float = 0.0
    loss_percentage: float = 0.0
    price_per_kwh: float
    network_cost_per_kwh: float
    total_amount: float
    path_nodes: list[str] = []
    explanation: dict | None = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _coerce_from_model(cls, data):
        """Accept the ORM Trade by converting via its to_dict(), which exposes
        path_nodes as a list (the raw column is a comma-joined string)."""
        if not isinstance(data, dict) and hasattr(data, "to_dict"):
            return data.to_dict()
        return data


class MatchResult(BaseModel):
    matched_trades: int
    total_volume_kwh: float
    total_value: float
    total_loss_kwh: float = 0.0
    trades: list[TradeOut]


# ---------------------------------------------------------------- telemetry

class TelemetryIn(BaseModel):
    device_id: str
    production_kw: float = Field(ge=0, le=1000.0, default=0.0)
    consumption_kw: float = Field(ge=0, le=1000.0, default=0.0)
    battery_soc: float = Field(ge=0, le=100.0, default=50.0)
    battery_kw: float = Field(ge=-1000.0, le=1000.0, default=0.0)
    voltage: float = Field(ge=0.0, le=1000.0, default=230.0)
    current: float = Field(ge=0.0, le=1000.0, default=0.0)
    power_kw: float = Field(ge=-1000.0, le=1000.0, default=0.0)
    # Legacy field names (pre-simulator clients); mapped onto new fields.
    production_kwh: float | None = Field(ge=0, le=1000.0, default=None)
    consumption_kwh: float | None = Field(ge=0, le=1000.0, default=None)
    battery_kwh: float | None = Field(ge=-1000.0, le=1000.0, default=None)


class TelemetryOut(BaseModel):
    id: str
    device_id: str
    node_id: str | None = None
    production_kw: float
    consumption_kw: float
    battery_soc: float
    battery_kw: float
    voltage: float
    current: float
    power_kw: float
    recorded_at: datetime

    model_config = {"from_attributes": True}
