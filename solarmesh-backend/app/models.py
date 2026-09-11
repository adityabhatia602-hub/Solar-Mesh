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
    Integer,
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
    ADJUSTMENT = "adjustment"


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
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    from_node: Mapped["GridNode"] = relationship(back_populates="edges_from", foreign_keys=[from_node_id])
    to_node: Mapped["GridNode"] = relationship(back_populates="edges_to", foreign_keys=[to_node_id])

    @property
    def utilization(self) -> float:
        return (self.load_kw / self.capacity_kw) if self.capacity_kw > 0 else 0.0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "from_node_id": self.from_node_id,
            "to_node_id": self.to_node_id,
            "capacity_kw": self.capacity_kw,
            "load_kw": self.load_kw,
            "loss_factor": self.loss_factor,
            "utilization": self.utilization,
            "is_active": self.is_active,
        }


# ---------------------------------------------------------------- market

class Order(Base):
    """A market order: either an offer to sell energy or a bid to buy energy."""
    __tablename__ = "orders"

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

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    offer_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True, nullable=False)
    bid_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True, nullable=False)
    seller_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    buyer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    quantity_kwh: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    price_per_kwh: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)  # gross, before grid cost
    network_cost_per_kwh: Mapped[float] = mapped_column(Numeric(10, 4), default=0.0, nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(14, 6), nullable=False)
    path_nodes: Mapped[str | None] = mapped_column(String(1000), nullable=True)  # comma-separated node ids
    status: Mapped[TradeStatus] = mapped_column(Enum(TradeStatus), default=TradeStatus.SETTLED, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)

    @property
    def path_node_list(self) -> list[str]:
        return self.path_nodes.split(",") if self.path_nodes else []

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "offer_id": self.offer_id,
            "bid_id": self.bid_id,
            "seller_id": self.seller_id,
            "buyer_id": self.buyer_id,
            "quantity_kwh": float(self.quantity_kwh),
            "price_per_kwh": float(self.price_per_kwh),
            "network_cost_per_kwh": float(self.network_cost_per_kwh),
            "total_amount": float(self.total_amount),
            "path_nodes": self.path_nodes.split(",") if self.path_nodes else [],
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
        }


class Telemetry(Base):
    """Periodic energy readings reported by devices."""
    __tablename__ = "telemetry"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"), index=True, nullable=False)
    production_kwh: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    consumption_kwh: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    battery_kwh: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "device_id": self.device_id,
            "production_kwh": self.production_kwh,
            "consumption_kwh": self.consumption_kwh,
            "battery_kwh": self.battery_kwh,
            "recorded_at": self.recorded_at.isoformat(),
        }
