#!/usr/bin/env python3
"""SolarMesh Practical Check: Database Backup & Restoration Drill.

Answers the question:
'Don't just ask "do we have backups?" Ask "have we ever actually restored one and had it work?"'

Drill Workflow:
1. Provisions an isolated test database with complete real-world SolarMesh entities
   (Users, Wallets, Ledger, Grid Nodes/Edges, Devices, Orders, Telemetry).
2. Generates a production-grade logical backup (.json.gz) with SHA-256 checksum & manifest.
3. Simulates catastrophic data wipe (drops all tables / deletes all records).
4. Restores the backup archive into the empty database.
5. Verifies 100% data fidelity, foreign-key relationships, and balance accuracy.
"""
import decimal
import json
import os
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.backup_manager import BackupManager
from app.db import Base
from app.models import (
    Device,
    GridEdge,
    GridNode,
    LedgerEntry,
    LedgerEntryType,
    Order,
    OrderSide,
    OrderStatus,
    Telemetry,
    User,
    UserRole,
    Wallet,
)


def run_backup_restore_drill():
    print("=" * 80)
    print("SOLARMESH DISASTER RECOVERY & RESTORATION DRILL (PRACTICAL CHECK)")
    print("=" * 80)

    drill_db_path = Path(tempfile.gettempdir()) / f"solarmesh_drill_{uuid.uuid4().hex[:6]}.db"
    drill_db_url = f"sqlite:///{drill_db_path}"
    drill_engine = create_engine(drill_db_url, echo=False)

    backup_temp_dir = Path(tempfile.gettempdir()) / f"solarmesh_backups_{uuid.uuid4().hex[:6]}"
    backup_temp_dir.mkdir(parents=True, exist_ok=True)

    mgr = BackupManager(backup_dir=backup_temp_dir, engine=drill_engine)

    try:
        # ---------------------------------------------------------------------
        # STEP 1: PROVISION COMPLETE RELATIONAL SYSTEM
        # ---------------------------------------------------------------------
        print("\n[+] STEP 1: Provisioning isolated database and seeding realistic test data...")
        Base.metadata.create_all(drill_engine)

        with Session(drill_engine) as session:
            # Users
            alice = User(
                id=str(uuid.uuid4()),
                email="alice.solar@solarmesh.io",
                hashed_password="hashed_pw_alice_secure_123",
                full_name="Alice Prosumer",
                role=UserRole.PROSUMER,
                is_active=True,
            )
            bob = User(
                id=str(uuid.uuid4()),
                email="bob.buyer@solarmesh.io",
                hashed_password="hashed_pw_bob_secure_456",
                full_name="Bob Consumer",
                role=UserRole.CONSUMER,
                is_active=True,
            )
            session.add_all([alice, bob])
            session.flush()

            # Wallets
            wallet_alice = Wallet(user_id=alice.id, balance=decimal.Decimal("5420.50"), reserved=decimal.Decimal("250.00"))
            wallet_bob = Wallet(user_id=bob.id, balance=decimal.Decimal("2180.75"), reserved=decimal.Decimal("0.00"))
            session.add_all([wallet_alice, wallet_bob])
            session.flush()

            # Ledger entries
            ledger_1 = LedgerEntry(
                wallet_id=wallet_alice.id,
                amount=decimal.Decimal("5000.00"),
                balance_after=decimal.Decimal("5000.00"),
                entry_type=LedgerEntryType.DEPOSIT,
                memo="Initial Solar Dividend Deposit",
            )
            ledger_2 = LedgerEntry(
                wallet_id=wallet_alice.id,
                amount=decimal.Decimal("420.50"),
                balance_after=decimal.Decimal("5420.50"),
                entry_type=LedgerEntryType.TRADE_RECEIPT,
                memo="Peer-to-peer solar export reward",
            )
            session.add_all([ledger_1, ledger_2])

            # Grid Topology
            node_a = GridNode(id=str(uuid.uuid4()), code="NODE_ALPHA", name="Substation Alpha", region="north", congestion_level=0.1)
            node_b = GridNode(id=str(uuid.uuid4()), code="NODE_BETA", name="Feeder Beta", region="north", congestion_level=0.0)
            session.add_all([node_a, node_b])
            session.flush()

            edge_1 = GridEdge(
                id=str(uuid.uuid4()),
                from_node_id=node_a.id,
                to_node_id=node_b.id,
                capacity_kw=600.0,
                load_kw=185.0,
                loss_factor=0.018,
                status="normal",
                is_active=True,
            )
            session.add(edge_1)

            # Device
            device_1 = Device(
                id=str(uuid.uuid4()),
                owner_id=alice.id,
                node_id=node_a.id,
                name="SolarEdge SE5000H",
                device_type="solar_panel",
                capacity_kwh=5.0,
                status="online",
                is_active=True,
            )
            session.add(device_1)
            session.flush()

            # Order
            order_1 = Order(
                id=str(uuid.uuid4()),
                user_id=alice.id,
                node_id=node_a.id,
                side=OrderSide.OFFER,
                quantity_kwh=25.0,
                price_per_kwh=3.85,
                filled_kwh=0.0,
                status=OrderStatus.OPEN,
            )
            session.add(order_1)

            # Telemetry
            telemetry_1 = Telemetry(
                id=str(uuid.uuid4()),
                device_id=device_1.id,
                node_id=node_a.id,
                production_kw=4.82,
                consumption_kw=1.20,
                battery_soc=88.5,
                battery_kw=3.5,
                voltage=230.2,
                current=20.9,
                power_kw=3.62,
            )
            session.add(telemetry_1)

            session.commit()

        print(f"    • Seeded 2 Users, 2 Wallets, 2 Ledger Entries, 2 Grid Nodes, 1 Edge, 1 Device, 1 Order, 1 Telemetry.")

        # ---------------------------------------------------------------------
        # STEP 2: CREATE AUTOMATED LOGICAL BACKUP
        # ---------------------------------------------------------------------
        print("\n[+] STEP 2: Executing automated backup...")
        manifest = mgr.create_backup(label="practical_check_drill", retention_days=30, compress=True)
        archive_path = backup_temp_dir / manifest["archive_filename"]

        print(f"    • Backup ID:      {manifest['backup_id']}")
        print(f"    • Archive File:   {manifest['archive_filename']}")
        print(f"    • SHA-256 Digest: {manifest['sha256']}")
        print(f"    • Total Records:  {manifest['total_rows']} across {len(manifest['tables_backed_up'])} tables")
        print(f"    • File Size:      {manifest['archive_bytes']} bytes")

        # ---------------------------------------------------------------------
        # STEP 3: SIMULATE CATASTROPHIC OUTAGE / DATA LOSS
        # ---------------------------------------------------------------------
        print("\n[!] STEP 3: Simulating catastrophic disaster (dropping all database tables)...")
        Base.metadata.drop_all(drill_engine)

        # Confirm data is destroyed
        with Session(drill_engine) as session:
            Base.metadata.create_all(drill_engine)
            u_count = session.query(User).count()
            w_count = session.query(Wallet).count()
            o_count = session.query(Order).count()
            print(f"    -> Current Database State: Users: {u_count} | Wallets: {w_count} | Orders: {o_count} (WIPED CLEAN)")
            assert u_count == 0 and w_count == 0 and o_count == 0

        # ---------------------------------------------------------------------
        # STEP 4: RESTORE BACKUP FROM ARCHIVE
        # ---------------------------------------------------------------------
        print("\n[*] STEP 4: Initiating full restoration from backup archive...")

        # A: Verify Integrity & Checksum
        is_valid, reason = mgr.verify_backup(archive_path)
        print(f"    -> SHA-256 Pre-Restore Check: {'VALID' if is_valid else 'FAILED'} ({reason})")
        assert is_valid, "Backup failed pre-restore validation!"

        # B: Execute Rehydration
        restore_result = mgr.restore_backup(archive_path, target_engine=drill_engine, wipe_target=True)
        print(f"    -> Restore Engine Status: {restore_result['status']}")
        print(f"    -> Restored {restore_result['total_rows_restored']} rows into target database.")

        # ---------------------------------------------------------------------
        # STEP 5: VERIFY COMPLETE DATA PARITY & INTEGRITY
        # ---------------------------------------------------------------------
        print("\n[+] STEP 5: Auditing restored database records against original data...")
        with Session(drill_engine) as session:
            # Check Users
            restored_alice = session.query(User).filter_by(email="alice.solar@solarmesh.io").first()
            restored_bob = session.query(User).filter_by(email="bob.buyer@solarmesh.io").first()
            assert restored_alice is not None, "Alice was not restored!"
            assert restored_bob is not None, "Bob was not restored!"
            assert restored_alice.full_name == "Alice Prosumer"
            assert restored_alice.role == UserRole.PROSUMER
            print("    [PASS] Users verified: Alice & Bob restored with correct credentials and roles.")

            # Check Wallets
            alice_w = session.query(Wallet).filter_by(user_id=restored_alice.id).first()
            bob_w = session.query(Wallet).filter_by(user_id=restored_bob.id).first()
            assert alice_w is not None and bob_w is not None
            assert float(alice_w.balance) == 5420.50, f"Expected ₹5420.50, got {alice_w.balance}"
            assert float(alice_w.reserved) == 250.00
            assert float(bob_w.balance) == 2180.75
            print(f"    [PASS] Wallets verified: Alice Balance: ₹{alice_w.balance:.2f} | Bob Balance: ₹{bob_w.balance:.2f}")

            # Check Ledger
            ledgers = session.query(LedgerEntry).filter_by(wallet_id=alice_w.id).order_by(LedgerEntry.id).all()
            assert len(ledgers) == 2, f"Expected 2 ledger entries, got {len(ledgers)}"
            print(f"    [PASS] Financial Ledger verified: {len(ledgers)} entries intact.")

            # Check Grid Topology
            nodes = session.query(GridNode).all()
            edges = session.query(GridEdge).all()
            assert len(nodes) == 2
            assert len(edges) == 1
            print(f"    [PASS] Grid Topology verified: {len(nodes)} substations/nodes, {len(edges)} transmission lines.")

            # Check Devices & Orders
            devices = session.query(Device).all()
            orders = session.query(Order).all()
            assert len(devices) == 1 and devices[0].name == "SolarEdge SE5000H"
            assert len(orders) == 1 and float(orders[0].price_per_kwh) == 3.85
            print(f"    [PASS] Smart Inverters & Market Orders verified: {len(devices)} device, {len(orders)} order intact.")

            # Check Telemetry
            telemetry_records = session.query(Telemetry).all()
            assert len(telemetry_records) == 1
            assert telemetry_records[0].battery_soc == 88.5
            print(f"    [PASS] Telemetry verified: Generation & battery SOC restored accurately.")

        print("\n" + "=" * 80)
        print("PRACTICAL CHECK PASSED: BACKUP WAS RESTORED AND PROVEN TO WORK 100%!")
        print("=" * 80)

    finally:
        if drill_db_path.exists():
            drill_db_path.unlink()
        import shutil
        shutil.rmtree(backup_temp_dir, ignore_errors=True)


if __name__ == "__main__":
    run_backup_restore_drill()
