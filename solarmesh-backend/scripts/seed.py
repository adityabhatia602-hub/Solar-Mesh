"""Seed the database with a demo grid, users, devices, wallets, and orders.

Usage:  python -m scripts.seed

Idempotent: each entity group is only created when missing, so running this
repeatedly never duplicates users, devices, or orders. See also
`python -m scripts.reset_demo` for a full clean reseed.
"""
from __future__ import annotations

from app.db import SessionLocal, run_lightweight_migrations
from app.models import (
    Device,
    GridEdge,
    GridNode,
    LedgerEntry,
    LedgerEntryType,
    Order,
    OrderSide,
    Trade,
    User,
    UserRole,
)
from app.security import hash_password
from app.services.wallet_service import apply_ledger_entry, get_or_create_wallet

SEED_BALANCE = 500.0


def seed_grid(db) -> dict:
    """Create the 6-node / 7-edge demo grid if absent. Returns code -> node map."""
    nodes: dict[str, GridNode] = {n.code: n for n in db.query(GridNode).all()}

    if not nodes:
        node_defs = [
            ("N1", "Substation Alpha", "substation", "north"),
            ("N2", "Feeder A1", "feeder", "north"),
            ("N3", "Feeder A2", "feeder", "north"),
            ("N4", "Household Block 1", "household", "north"),
            ("N5", "Household Block 2", "household", "south"),
            ("N6", "Feeder B1", "feeder", "south"),
        ]
        for code, name, ntype, region in node_defs:
            n = GridNode(code=code, name=name, node_type=ntype, region=region)
            db.add(n)
            nodes[code] = n
        db.flush()
        print("  grid nodes: created 6")

    edges = db.query(GridEdge).all()
    if not edges:
        edge_defs = [
            ("N1", "N2", 100.0, 0.01),
            ("N1", "N3", 100.0, 0.01),
            ("N2", "N4", 40.0, 0.02),
            ("N3", "N5", 30.0, 0.03),
            ("N2", "N6", 25.0, 0.04),
            ("N6", "N5", 20.0, 0.03),
            ("N4", "N5", 15.0, 0.05),
        ]
        for a, b, cap, loss in edge_defs:
            db.add(GridEdge(from_node_id=nodes[a].id, to_node_id=nodes[b].id,
                            capacity_kw=cap, loss_factor=loss, load_kw=0.0))
            db.add(GridEdge(from_node_id=nodes[b].id, to_node_id=nodes[a].id,
                            capacity_kw=cap, loss_factor=loss, load_kw=0.0))
        db.flush()
        print("  grid edges: created 14 (7 bidirectional)")

    return nodes


def seed_users(db) -> dict:
    """Create demo users + $500 wallets if absent."""
    user_defs = [
        ("alice@demo.io", "Alice Chen", "prosumer"),
        ("bob@demo.io", "Bob Martinez", "prosumer"),
        ("carol@demo.io", "Carol Singh", "consumer"),
        ("admin@demo.io", "Grid Admin", "admin"),
    ]
    users: dict[str, User] = {u.email: u for u in db.query(User).all()}

    created = False
    for email, name, role in user_defs:
        if email in users:
            continue
        u = User(email=email, full_name=name,
                 hashed_password=hash_password("password123"),
                 role=UserRole(role))
        db.add(u)
        users[email] = u
        created = True
    if created:
        db.flush()
        print("  users: created 4 demo accounts (password: password123)")

    for email, u in users.items():
        wallet = get_or_create_wallet(db, u.id)
        has_entries = db.query(LedgerEntry).filter(LedgerEntry.wallet_id == wallet.id).first() is not None
        if float(wallet.balance) == 0.0 and not has_entries:
            apply_ledger_entry(db, wallet, LedgerEntryType.DEPOSIT, SEED_BALANCE, memo="Seed deposit")
    return users


def seed_devices(db, users: dict, nodes: dict) -> None:
    existing = db.query(Device).filter(Device.owner_id.in_([u.id for u in users.values()])).count()
    if existing:
        return

    device_defs = [
        ("alice@demo.io", "N4", "Alice Rooftop Array", "solar_panel", 8.0),
        ("alice@demo.io", "N4", "Alice Battery", "battery", 10.0),
        ("bob@demo.io", "N5", "Bob Rooftop Array", "solar_panel", 6.0),
        ("carol@demo.io", "N6", "Carol Home Meter", "meter", 0.0),
    ]
    for owner, ncode, name, dtype, cap in device_defs:
        db.add(Device(owner_id=users[owner].id, node_id=nodes[ncode].id,
                      name=name, device_type=dtype, capacity_kwh=cap))
    db.flush()
    print("  devices: created 4 demo devices")


def seed_orders(db, users: dict, nodes: dict) -> None:
    if db.query(Order).count() > 0:
        return
    alice, bob, carol = users["alice@demo.io"], users["bob@demo.io"], users["carol@demo.io"]
    db.add(Order(side=OrderSide.OFFER, user_id=alice.id, node_id=nodes["N4"].id,
                 price_per_kwh=0.12, quantity_kwh=10.0))
    db.add(Order(side=OrderSide.OFFER, user_id=bob.id, node_id=nodes["N5"].id,
                 price_per_kwh=0.10, quantity_kwh=8.0))
    db.add(Order(side=OrderSide.BID, user_id=carol.id, node_id=nodes["N6"].id,
                 price_per_kwh=0.30, quantity_kwh=5.0))
    db.flush()
    print("  orders: created 3 seed orders (Alice SELL, Bob SELL, Carol BUY)")


def main() -> None:
    run_lightweight_migrations()
    db = SessionLocal()
    try:
        print("Seeding SolarMesh demo data...")
        nodes = seed_grid(db)
        users = seed_users(db)
        seed_devices(db, users, nodes)
        seed_orders(db, users, nodes)
        db.commit()

        print("Seed complete:")
        print(f"  grid nodes : {db.query(GridNode).count()}")
        print(f"  grid edges : {db.query(GridEdge).count()}")
        print(f"  users      : {db.query(User).count()}")
        print(f"  devices    : {db.query(Device).count()}")
        print(f"  orders     : {db.query(Order).count()}")
        print(f"  trades     : {db.query(Trade).count()}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
