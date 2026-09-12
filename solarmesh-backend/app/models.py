"""SQLAlchemy ORM models for SolarMesh."""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------- enums

class UserRole(str, enum.Enum):
    PROSUMER = "prosumer"
    CONSUMER = "consumer"
    ADMIN = "admin"


class OrderSide(str, enum.Enum):
    OFFER = "offer"  # seller
    BID = "bid"      # buyer


class OrderStatus(str, enum.Enum):
    OPEN = "open"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class TradeStatus(str, enum.Enum):
    PENDING_SETTLEMENT = "pending_settlement"
    SETTLED = "settled"
    FAILED = "failed"


class LedgerEntryType(str, enum.Enum):
    DEPOSIT = "deposit"
    WITHDRAWAL = "withdrawal"
    TRADE_PAYMENT = "trade_payment"
    TRADE_RECEIPT = "trade_receipt"
    NETWORK_FEE = "network_fee"
    ADJUSTMENT = "adjustment"
    TRANSFER_OUT = "transfer_out"
    TRANSFER_IN = "transfer_in"


class DeviceStatus(str, enum.Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    MAINTENANCE = "maintenance"


class GridEdgeStatus(str, enum.Enum):
    NORMAL = "normal"
    CONGESTED = "congested"
    OFFLINE = "offline"


class GridEventType(str, enum.Enum):
    CONGESTION = "congestion"
    EDGE_OFFLINE = "edge_offline"
    EDGE_RECOVERED = "edge_recovered"


# ---------------------------------------------------------------- users / wallets

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.PROSUMER, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    wallet: Mapped["Wallet"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    devices: Mapped[list["Device"]] = relationship(back_populates="owner", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role.value,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
        }


class Wallet(Base):
    __tablename__ = "wallets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    balance: Mapped[float] = mapped_column(Numeric(14, 6), default=0.0, nullable=False)
    reserved: Mapped[float] = mapped_column(Numeric(14, 6), default=0.0, nullable=False)
    energy_kwh_sold: Mapped[float] = mapped_column(Numeric(14, 4), default=0.0, nullable=False)
    energy_kwh_bought: Mapped[float] = mapped_column(Numeric(14, 4), default=0.0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    user: Mapped["User"] = relationship(back_populates="wallet")

    @property
    def available(self) -> float:
        return float(self.balance) - float(self.reserved)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "balance": float(self.balance),
            "reserved": float(self.reserved),
            "available": self.available,
            "energy_kwh_sold": float(self.energy_kwh_sold),
            "energy_kwh_bought": float(self.energy_kwh_bought),
            "updated_at": self.updated_at.isoformat(),
        }


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    __table_args__ = (
        Index("ix_ledger_wallet_created", "wallet_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    wallet_id: Mapped[str] = mapped_column(ForeignKey("wallets.id", ondelete="CASCADE"), index=True, nullable=False)
    entry_type: Mapped[LedgerEntryType] = mapped_column(Enum(LedgerEntryType), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 6), nullable=False)  # signed
    balance_after: Mapped[float] = mapped_column(Numeric(14, 6), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(255), nullable=True)  # trade id etc.
    memo: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "wallet_id": self.wallet_id,
            "entry_type": self.entry_type.value,
            "amount": float(self.amount),
            "balance_after": float(self.balance_after),
            "reference": self.reference,
            "memo": self.memo,
            "created_at": self.created_at.isoformat(),
        }


# ---------------------------------------------------------------- devices / grid

class Device(Base):
    """A solar panel / battery / consumption meter owned by a user, attached to a grid node."""
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    node_id: Mapped[str] = mapped_column(ForeignKey("grid_nodes.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    device_type: Mapped[str] = mapped_column(String(32), default="solar_panel", nullable=False)
    capacity_kwh: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="online", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    owner: Mapped["User"] = relationship(back_populates="devices")
    node: Mapped["GridNode"] = relationship(back_populates="devices")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "owner_id": self.owner_id,
            "node_id": self.node_id,
            "name": self.name,
            "device_type": self.device_type,
            "capacity_kwh": self.capacity_kwh,
            "status": self.status,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
        }


class GridNode(Base):
    """A node in the distribution grid graph (transformer / feeder / household connection)."""
    __tablename__ = "grid_nodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    node_type: Mapped[str] = mapped_column(String(32), default="household", nullable=False)
    region: Mapped[str] = mapped_column(String(64), default="default", index=True, nullable=False)
    congestion_level: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # 0..1

    devices: Mapped[list["Device"]] = relationship(back_populates="node")
    edges_from: Mapped[list["GridEdge"]] = relationship(
        back_populates="from_node", foreign_keys="GridEdge.from_node_id", cascade="all, delete-orphan"
    )
    edges_to: Mapped[list["GridEdge"]] = relationship(
        back_populates="to_node", foreign_keys="GridEdge.to_node_id", cascade="all, delete-orphan"
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "code": self.code,
            "name": self.name,
            "node_type": self.node_type,
            "region": self.region,
            "congestion_level": self.congestion_level,
        }


class GridEdge(Base):
    """A physical line between two grid nodes with capacity and loss characteristics."""
    __tablename__ = "grid_edges"
    __table_args__ = (UniqueConstraint("from_node_id", "to_node_id", name="uq_edge_direction"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    from_node_id: Mapped[str] = mapped_column(ForeignKey("grid_nodes.id", ondelete="CASCADE"), index=True, nullable=False)
    to_node_id: Mapped[str] = mapped_column(ForeignKey("grid_nodes.id", ondelete="CASCADE"), index=True, nullable=False)
    capacity_kw: Mapped[float] = mapped_column(Float, default=10.0, nullable=False)
    load_kw: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    loss_factor: Mapped[float] = mapped_column(Float, default=0.02, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="normal", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    from_node: Mapped["GridNode"] = relationship(back_populates="edges_from", foreign_keys=[from_node_id])
    to_node: Mapped["GridNode"] = relationship(back_populates="edges_to", foreign_keys=[to_node_id])

    @property
    def utilization(self) -> float:
        return (self.load_kw / self.capacity_kw) if self.capacity_kw > 0 else 0.0

    @property
    def edge_status(self) -> str:
        if not self.is_active:
            return GridEdgeStatus.OFFLINE.value
        if self.capacity_kw > 0 and (self.load_kw / self.capacity_kw) > 0.8:
            return GridEdgeStatus.CONGESTED.value
        return GridEdgeStatus.NORMAL.value

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "from_node_id": self.from_node_id,
            "to_node_id": self.to_node_id,
            "capacity_kw": self.capacity_kw,
            "load_kw": self.load_kw,
            "loss_factor": self.loss_factor,
            "utilization": self.utilization,
            "status": self.edge_status,
            "is_active": self.is_active,
        }


# ---------------------------------------------------------------- market

class Order(Base):
    """A market order: either an offer to sell energy or a bid to buy energy."""
    __tablename__ = "orders"
    __table_args__ = (
        Index("ix_orders_status_side_price", "status", "side", "price_per_kwh"),
        Index("ix_orders_user_created", "user_id", "created_at"),
        Index("ix_orders_user_node_status", "user_id", "node_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    side: Mapped[OrderSide] = mapped_column(Enum(OrderSide), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    node_id: Mapped[str] = mapped_column(ForeignKey("grid_nodes.id"), index=True, nullable=False)
    price_per_kwh: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    quantity_kwh: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    filled_kwh: Mapped[float] = mapped_column(Numeric(10, 4), default=0.0, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.OPEN, index=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    user: Mapped["User"] = relationship()
    node: Mapped["GridNode"] = relationship()

    @property
    def remaining_kwh(self) -> float:
        return max(0.0, float(self.quantity_kwh) - float(self.filled_kwh))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "side": self.side.value,
            "user_id": self.user_id,
            "node_id": self.node_id,
            "price_per_kwh": float(self.price_per_kwh),
            "quantity_kwh": float(self.quantity_kwh),
            "filled_kwh": float(self.filled_kwh),
            "remaining_kwh": self.remaining_kwh,
            "status": self.status.value,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_at": self.created_at.isoformat(),
        }


class Trade(Base):
    """An executed match between an offer and a bid."""
    __tablename__ = "trades"
    __table_args__ = (
        Index("ix_trades_seller_created", "seller_id", "created_at"),
        Index("ix_trades_buyer_created", "buyer_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    offer_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True, nullable=False)
    bid_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True, nullable=False)
    seller_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    buyer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    quantity_kwh: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)  # energy sent by seller
    delivered_kwh: Mapped[float] = mapped_column(Numeric(10, 4), default=0.0, nullable=False)  # energy received by buyer
    energy_loss_kwh: Mapped[float] = mapped_column(Numeric(10, 4), default=0.0, nullable=False)
    price_per_kwh: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)  # seller ask, before grid cost
    network_cost_per_kwh: Mapped[float] = mapped_column(Numeric(10, 4), default=0.0, nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(14, 6), nullable=False)  # buyer pays: energy + network
    path_nodes: Mapped[str | None] = mapped_column(String(1000), nullable=True)  # comma-separated node codes
    explanation: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # match reason / checks breakdown
    status: Mapped[TradeStatus] = mapped_column(Enum(TradeStatus), default=TradeStatus.SETTLED, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)

    @property
    def path_node_list(self) -> list[str]:
        return self.path_nodes.split(",") if self.path_nodes else []

    def to_dict(self) -> dict:
        qty = float(self.quantity_kwh)
        delivered = float(self.delivered_kwh)
        return {
            "id": self.id,
            "offer_id": self.offer_id,
            "bid_id": self.bid_id,
            "seller_id": self.seller_id,
            "buyer_id": self.buyer_id,
            "quantity_kwh": qty,
            "delivered_kwh": delivered,
            "energy_loss_kwh": float(self.energy_loss_kwh),
            "loss_percentage": round((1.0 - delivered / qty) * 100, 2) if qty > 0 else 0.0,
            "price_per_kwh": float(self.price_per_kwh),
            "network_cost_per_kwh": float(self.network_cost_per_kwh),
            "total_amount": float(self.total_amount),
            "path_nodes": self.path_nodes.split(",") if self.path_nodes else [],
            "explanation": self.explanation,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
        }


class Telemetry(Base):
    """Periodic energy readings reported by devices (simulator or real IoT)."""
    __tablename__ = "telemetry"
    __table_args__ = (
        Index("ix_telemetry_device_recorded", "device_id", "recorded_at"),
        Index("ix_telemetry_recorded_at_desc", "recorded_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True, nullable=False)
    node_id: Mapped[str | None] = mapped_column(ForeignKey("grid_nodes.id"), nullable=True)
    production_kw: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # instantaneous solar
    consumption_kw: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # instantaneous load
    battery_soc: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # 0..100 %
    battery_kw: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # stored energy at reading
    voltage: Mapped[float] = mapped_column(Float, default=230.0, nullable=False)
    current: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    power_kw: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)  # net grid exchange (+ export)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "device_id": self.device_id,
            "node_id": self.node_id,
            "production_kw": self.production_kw,
            "consumption_kw": self.consumption_kw,
            "battery_soc": self.battery_soc,
            "battery_kw": self.battery_kw,
            "voltage": self.voltage,
            "current": self.current,
            "power_kw": self.power_kw,
            "recorded_at": self.recorded_at.isoformat(),
        }


class SimulationState(Base):
    """Singleton row tracking the global simulation loop state."""
    __tablename__ = "simulation_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    is_running: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    interval_seconds: Mapped[float] = mapped_column(Float, default=4.0, nullable=False)
    tick_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_tick_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_by: Mapped[str | None] = mapped_column(String(36), nullable=True)

    def to_dict(self) -> dict:
        return {
            "is_running": self.is_running,
            "interval_seconds": self.interval_seconds,
            "tick_count": self.tick_count,
            "last_tick_at": self.last_tick_at.isoformat() if self.last_tick_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
        }


class GridEvent(Base):
    """Congestion / outage events on grid edges for monitoring and demo badges."""
    __tablename__ = "grid_events"
    __table_args__ = (
        Index("ix_grid_events_type_created", "event_type", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    edge_id: Mapped[str] = mapped_column(ForeignKey("grid_edges.id", ondelete="CASCADE"), index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    utilization: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    detail: Mapped[str | None] = mapped_column(String(500), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "edge_id": self.edge_id,
            "event_type": self.event_type,
            "utilization": self.utilization,
            "detail": self.detail,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "created_at": self.created_at.isoformat(),
        }
