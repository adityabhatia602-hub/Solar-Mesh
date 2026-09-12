"""Pytest test suite for SolarMesh Backup & Disaster Recovery Engine."""
import datetime
import gzip
import json
import os
import tempfile
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.backup_manager import BackupManager
from app.db import Base
from app.models import User, UserRole, Wallet


@pytest.fixture
def temp_env():
    """Provides an isolated sqlite database and backup directory."""
    temp_dir = Path(tempfile.mkdtemp())
    db_path = temp_dir / "test.db"
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)
    mgr = BackupManager(backup_dir=temp_dir / "backups", engine=engine)

    # Seed an active user and wallet
    with Session(engine) as session:
        user = User(
            id=str(uuid.uuid4()),
            email="backup_test@solarmesh.io",
            hashed_password="secret_hash",
            full_name="Backup Tester",
            role=UserRole.CONSUMER,
            is_active=True,
        )
        session.add(user)
        session.flush()

        wallet = Wallet(user_id=user.id, balance=150.0, reserved=0.0)
        session.add(wallet)
        session.commit()

    yield {
        "engine": engine,
        "backup_mgr": mgr,
        "temp_dir": temp_dir,
    }

    import shutil
    shutil.rmtree(temp_dir, ignore_errors=True)


def test_backup_creation_and_manifest(temp_env):
    mgr = temp_env["backup_mgr"]
    manifest = mgr.create_backup(label="unit_test")

    assert manifest["status"] == "COMPLETED"
    assert manifest["total_rows"] >= 2
    assert "sha256" in manifest
    assert len(manifest["sha256"]) == 64

    archive_path = mgr.backup_dir / manifest["archive_filename"]
    assert archive_path.exists()
    assert archive_path.stat().st_size > 0

    manifest_path = mgr.backup_dir / f"{manifest['backup_id']}.manifest.json"
    assert manifest_path.exists()


def test_backup_tampering_detection(temp_env):
    mgr = temp_env["backup_mgr"]
    manifest = mgr.create_backup(label="tamper_test")
    archive_path = mgr.backup_dir / manifest["archive_filename"]

    # Verify initially valid
    is_valid, reason = mgr.verify_backup(archive_path)
    assert is_valid is True

    # Tamper with archive bytes
    with open(archive_path, "ab") as f:
        f.write(b"CORRUPTED_DATA_INJECTED")

    # Verify checksum mismatch is caught
    is_valid_after, reason_after = mgr.verify_backup(archive_path)
    assert is_valid_after is False
    assert "Checksum mismatch" in reason_after

    # Ensure restore aborts on tampered archive
    with pytest.raises(ValueError, match="Cannot restore invalid backup"):
        mgr.restore_backup(archive_path)


def test_full_restore_parity(temp_env):
    mgr = temp_env["backup_mgr"]
    engine = temp_env["engine"]

    manifest = mgr.create_backup(label="restore_test")
    archive_path = mgr.backup_dir / manifest["archive_filename"]

    # Wipe all users
    with engine.begin() as conn:
        conn.execute(Base.metadata.tables["wallets"].delete())
        conn.execute(Base.metadata.tables["users"].delete())

    # Verify database is empty
    with Session(engine) as session:
        assert session.query(User).count() == 0
        assert session.query(Wallet).count() == 0

    # Restore from archive
    restore_meta = mgr.restore_backup(archive_path)
    assert restore_meta["status"] == "RESTORED_SUCCESSFULLY"

    # Verify records are restored exactly
    with Session(engine) as session:
        restored_user = session.query(User).filter_by(email="backup_test@solarmesh.io").first()
        assert restored_user is not None
        assert restored_user.full_name == "Backup Tester"

        restored_wallet = session.query(Wallet).filter_by(user_id=restored_user.id).first()
        assert restored_wallet is not None
        assert float(restored_wallet.balance) == 150.0


def test_retention_pruning(temp_env):
    mgr = temp_env["backup_mgr"]

    # Create a backup
    manifest = mgr.create_backup(label="recent")
    recent_archive = mgr.backup_dir / manifest["archive_filename"]

    # Create a simulated old backup (40 days old)
    old_backup_id = "backup_20260101_000000_old123"
    old_manifest_data = {
        "backup_id": old_backup_id,
        "archive_filename": f"{old_backup_id}.json.gz",
        "created_at_utc": (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=40)).isoformat(),
        "sha256": "fakehash",
        "total_rows": 1,
    }
    old_archive = mgr.backup_dir / f"{old_backup_id}.json.gz"
    old_archive.write_bytes(b"dummy")
    old_manifest = mgr.backup_dir / f"{old_backup_id}.manifest.json"
    old_manifest.write_text(json.dumps(old_manifest_data))

    assert old_archive.exists()
    assert recent_archive.exists()

    # Prune backups older than 30 days
    deleted = mgr.prune_backups(retention_days=30)

    assert f"{old_backup_id}.json.gz" in deleted
    assert not old_archive.exists()
    assert not old_manifest.exists()
    # Recent backup must still exist
    assert recent_archive.exists()
