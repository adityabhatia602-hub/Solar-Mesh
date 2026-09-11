"""Seed the database with a demo grid, users, devices, and orders.

Usage:  python -m scripts.seed
"""
from __future__ import annotations

from app.db import Base, SessionLocal, engine
from app.models import Device, GridEdge, GridNode, Order, OrderSide, User, UserRole
from app.security import hash_password
from app.services.wallet_service import apply_ledger_entry, get_or_create_wallet
from app.models import LedgerEntryType


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(GridNode).count() > 0:
            print("Database already seeded — skipping.")
            return

        # ------------------------------------------------ grid topology
        # 6 nodes arranged in a small mesh; two feeders, congestion on one edge.
        node_defs = [
            ("N1", "Substation Alpha", "substation", "north"),
            ("N2", "Feeder A1", "feeder", "north"),
            ("N3", "Feeder A2", "feeder", "north"),
            ("N4", "Household Block 1", "household", "north"),
            ("N5", "Household Block 2", "household", "south"),
            ("N6", "Feeder B1", "feeder", "south"),
        ]
        nodes: dict[str, GridNode] = {}
        for code, name, ntype, region in node_defs:
            n = GridNode(code=code, name=name, node_type=ntype, region=region)
            db.add(n)
            nodes[code] = n
        db.flush()

        edge_defs = [
            ("N1", "N2", 100.0, 0.01),
            ("N1", "N3", 100.0, 0.01),
            ("N2", "N4", 40.0, 0.02),
            ("N3", "N5", 30.0, 0.03),
            ("N2", "N6", 25.0, 0.04),
            ("N6", "N5", 20.0, 0.03),
            ("N4", "N5", 15.0, 0.05),
        ]
        edge_objs: dict[tuple[str, str], GridEdge] = {}
        for a, b, cap, loss in edge_defs:
            e1 = GridEdge(from_node_id=nodes[a].id, to_node_id=nodes[b].id,
                          capacity_kw=cap, loss_factor=loss, load_kw=0.0)
            e2 = GridEdge(from_node_id=nodes[b].id, to_node_id=nodes[a].id,
                          capacity_kw=cap, loss_factor=loss, load_kw=0.0)
            db.add_all([e1, e2])
            edge_objs[(a, b)] = e1
            edge_objs[(b, a)] = e2
        # simulate congestion on the N2-N6 corridor
        edge_objs[("N2", "N6")].load_kw = 19.0
        edge_objs[("N2", "N6")].capacity_kw = 20.0
        db.flush()

        # ------------------------------------------------ users
        user_defs = [
            ("alice@demo.io", "Alice Chen", "prosumer"),
            ("bob@demo.io", "Bob Martinez", "prosumer"),
            ("carol@demo.io", "Carol Singh", "consumer"),
            ("admin@demo.io", "Grid Admin", "admin"),
        ]
        users: dict[str, User] = {}
        for email, name, role in user_defs:
            u = User(email=email, full_name=name,
                     hashed_password=hash_password("password123"),
                     role=UserRole(role))
            db.add(u)
            users[email] = u
        db.flush()

        for u in users.values():
            w = get_or_create_wallet(db, u.id)
            apply_ledger_entry(db, w, LedgerEntryType.DEPOSIT, 500.0, memo="Seed deposit")

        # ------------------------------------------------ devices
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

        # ------------------------------------------------ sample orders
        alice, bob, carol = users["alice@demo.io"], users["bob@demo.io"], users["carol@demo.io"]
        db.add(Order(side=OrderSide.OFFER, user_id=alice.id, node_id=nodes["N4"].id,
                     price_per_kwh=0.12, quantity_kwh=10.0))
        db.add(Order(side=OrderSide.OFFER, user_id=bob.id, node_id=nodes["N5"].id,
                     price_per_kwh=0.10, quantity_kwh=8.0))
        db.add(Order(side=OrderSide.BID, user_id=carol.id, node_id=nodes["N6"].id,
                     price_per_kwh=0.30, quantity_kwh=5.0))
        db.commit()

        print("Seed complete:")
        print(f"  grid nodes : {db.query(GridNode).count()}")
        print(f"  grid edges : {db.query(GridEdge).count()}")
        print(f"  users      : {db.query(User).count()} (password: password123)")
        print(f"  devices    : {db.query(Device).count()}")
        print(f"  orders     : {db.query(Order).count()}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
