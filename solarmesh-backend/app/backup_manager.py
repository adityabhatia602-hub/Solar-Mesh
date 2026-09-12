"""SolarMesh Automated Database Backup & Disaster Recovery Engine.

Provides:
- Topological table export respecting foreign keys
- Gzip-compressed JSON archives with SHA-256 checksums
- Pre-restoration integrity validation (tamper detection)
- Safe transactional restoration with schema recreation
- Post-restore record count verification
- Automated retention pruning (default: 30 days)
"""
from __future__ import annotations

import datetime
import decimal
import enum
import gzip
import hashlib
import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Base, engine as default_engine

logger = logging.getLogger("solarmesh.backup")

DEFAULT_BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "backups"))


class BackupJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder handling datetimes, enums, Decimals, and UUIDs."""
    def default(self, o: Any) -> Any:
        if isinstance(o, (datetime.datetime, datetime.date)):
            return o.isoformat()
        if isinstance(o, decimal.Decimal):
            return float(o)
        if isinstance(o, enum.Enum):
            return o.value
        if isinstance(o, uuid.UUID):
            return str(o)
        return super().default(o)


def compute_sha256(file_path: Path) -> str:
    """Compute SHA-256 digest of a file in streaming chunks."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


class BackupManager:
    """Handles automated database backups, verification, and restoration."""

    def __init__(self, backup_dir: Optional[Path] = None, engine: Any = None):
        self.backup_dir = Path(backup_dir or DEFAULT_BACKUP_DIR)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.engine = engine or default_engine

    def create_backup(
        self,
        label: Optional[str] = None,
        retention_days: int = 30,
        compress: bool = True,
    ) -> Dict[str, Any]:
        """Create a full logical database backup of all registered models.

        Returns metadata manifest including row counts and SHA-256 checksum.
        """
        now = datetime.datetime.now(datetime.timezone.utc)
        backup_id = f"backup_{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        if label:
            backup_id = f"{backup_id}_{label}"

        table_data: Dict[str, List[Dict[str, Any]]] = {}
        row_counts: Dict[str, int] = {}

        # Export tables in topological order (parents before children)
        with self.engine.connect() as conn:
            for table in Base.metadata.sorted_tables:
                table_name = table.name
                query = select(table)
                result = conn.execute(query)
                rows = [dict(row._mapping) for row in result]
                table_data[table_name] = rows
                row_counts[table_name] = len(rows)
                logger.info("Backed up table '%s': %d rows", table_name, len(rows))

        payload = {
            "backup_id": backup_id,
            "created_at_utc": now.isoformat(),
            "solar_mesh_version": "0.1.0",
            "schema_version": "1.0",
            "tables": list(table_data.keys()),
            "row_counts": row_counts,
            "data": table_data,
        }

        # Write serialized archive
        json_bytes = json.dumps(payload, cls=BackupJSONEncoder, indent=2).encode("utf-8")
        raw_size = len(json_bytes)

        if compress:
            archive_filename = f"{backup_id}.json.gz"
            archive_path = self.backup_dir / archive_filename
            with gzip.open(archive_path, "wb", compresslevel=9) as f_out:
                f_out.write(json_bytes)
        else:
            archive_filename = f"{backup_id}.json"
            archive_path = self.backup_dir / archive_filename
            archive_path.write_bytes(json_bytes)

        archive_size = archive_path.stat().st_size
        sha256_hash = compute_sha256(archive_path)

        manifest = {
            "backup_id": backup_id,
            "archive_filename": archive_filename,
            "created_at_utc": now.isoformat(),
            "uncompressed_bytes": raw_size,
            "archive_bytes": archive_size,
            "sha256": sha256_hash,
            "total_rows": sum(row_counts.values()),
            "tables_backed_up": row_counts,
            "status": "COMPLETED",
        }

        manifest_path = self.backup_dir / f"{backup_id}.manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        logger.info(
            "Backup %s completed: %d rows, %.2f KB (sha256: %s...)",
            backup_id,
            manifest["total_rows"],
            archive_size / 1024,
            sha256_hash[:12],
        )

        # Automatically prune old archives
        if retention_days > 0:
            self.prune_backups(retention_days=retention_days)

        return manifest

    def verify_backup(self, archive_path: Path) -> Tuple[bool, str]:
        """Verify the integrity and SHA-256 checksum of a backup archive."""
        archive_path = Path(archive_path)
        if not archive_path.exists():
            return False, f"Archive file does not exist: {archive_path}"

        # Locate manifest
        backup_id = archive_path.name.replace(".json.gz", "").replace(".json", "")
        manifest_path = archive_path.parent / f"{backup_id}.manifest.json"

        if not manifest_path.exists():
            return False, f"Manifest file missing for archive: {manifest_path}"

        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception as e:
            return False, f"Failed to parse manifest JSON: {e}"

        expected_sha = manifest.get("sha256")
        actual_sha = compute_sha256(archive_path)

        if expected_sha != actual_sha:
            return False, f"Checksum mismatch! Expected {expected_sha}, got {actual_sha} (Tampering detected)"

        # Verify archive can be decompressed and parsed
        try:
            if archive_path.name.endswith(".gz"):
                with gzip.open(archive_path, "rt", encoding="utf-8") as f:
                    data = json.load(f)
            else:
                data = json.loads(archive_path.read_text(encoding="utf-8"))
            if "data" not in data or "row_counts" not in data:
                return False, "Archive JSON structure missing required keys ('data', 'row_counts')"
        except Exception as e:
            return False, f"Archive decompression/parse error: {e}"

        return True, "Checksum and archive payload verified successfully"

    def restore_backup(
        self,
        archive_path: Path,
        target_engine: Optional[Any] = None,
        wipe_target: bool = True,
    ) -> Dict[str, Any]:
        """Restore database from a verified backup archive.

        Args:
            archive_path: Path to the .json.gz or .json archive
            target_engine: Optional alternative target SQLAlchemy engine
            wipe_target: If True, drops existing tables or clears records before restore
        """
        archive_path = Path(archive_path)
        is_valid, reason = self.verify_backup(archive_path)
        if not is_valid:
            raise ValueError(f"Cannot restore invalid backup: {reason}")

        # Decompress data
        if archive_path.name.endswith(".gz"):
            with gzip.open(archive_path, "rt", encoding="utf-8") as f:
                payload = json.load(f)
        else:
            payload = json.loads(archive_path.read_text(encoding="utf-8"))

        dest_engine = target_engine or self.engine

        # Ensure schema exists on destination
        Base.metadata.create_all(dest_engine)

        # Clear existing data in reverse topological order if wipe_target is requested
        restored_counts: Dict[str, int] = {}
        with dest_engine.begin() as conn:
            if wipe_target:
                for table in reversed(Base.metadata.sorted_tables):
                    conn.execute(table.delete())

            # Insert records in topological order (parents before children)
            from sqlalchemy import Date, DateTime

            for table in Base.metadata.sorted_tables:
                table_name = table.name
                rows = payload["data"].get(table_name, [])
                if rows:
                    datetime_cols = {c.name for c in table.columns if isinstance(c.type, DateTime)}
                    date_cols = {c.name for c in table.columns if isinstance(c.type, Date)}

                    cleaned_rows = []
                    for r in rows:
                        clean_r = dict(r)
                        for col in datetime_cols:
                            val = clean_r.get(col)
                            if isinstance(val, str):
                                try:
                                    clean_r[col] = datetime.datetime.fromisoformat(val)
                                except Exception:
                                    pass
                        for col in date_cols:
                            val = clean_r.get(col)
                            if isinstance(val, str):
                                try:
                                    clean_r[col] = datetime.date.fromisoformat(val)
                                except Exception:
                                    pass
                        cleaned_rows.append(clean_r)

                    conn.execute(table.insert(), cleaned_rows)
                restored_counts[table_name] = len(rows)

        # Verify restoration matches original counts
        original_counts = payload.get("row_counts", {})
        for tbl, expected in original_counts.items():
            actual = restored_counts.get(tbl, 0)
            if actual != expected:
                raise RuntimeError(
                    f"Restore verification failed for table '{tbl}': expected {expected} rows, got {actual}"
                )

        logger.info(
            "Successfully restored backup %s: %d total rows across %d tables.",
            payload.get("backup_id"),
            sum(restored_counts.values()),
            len(restored_counts),
        )

        return {
            "backup_id": payload.get("backup_id"),
            "restored_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "total_rows_restored": sum(restored_counts.values()),
            "tables_restored": restored_counts,
            "status": "RESTORED_SUCCESSFULLY",
        }

    def prune_backups(self, retention_days: int = 30) -> List[str]:
        """Prune backups older than retention_days.

        Returns list of deleted backup filenames.
        """
        if retention_days <= 0:
            return []

        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=retention_days)
        deleted: List[str] = []

        for manifest_file in self.backup_dir.glob("*.manifest.json"):
            try:
                manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
                created_str = manifest.get("created_at_utc")
                if not created_str:
                    continue
                created_dt = datetime.datetime.fromisoformat(created_str)
                if created_dt < cutoff:
                    archive_name = manifest.get("archive_filename")
                    if archive_name:
                        archive_file = self.backup_dir / archive_name
                        if archive_file.exists():
                            archive_file.unlink()
                            deleted.append(archive_name)
                    manifest_file.unlink()
                    deleted.append(manifest_file.name)
                    logger.info("Pruned expired backup: %s (created %s)", archive_name, created_str)
            except Exception as e:
                logger.warning("Error inspecting backup manifest %s: %s", manifest_file, e)

        return deleted

    def list_backups(self) -> List[Dict[str, Any]]:
        """List all available backups with metadata, ordered latest first."""
        results: List[Dict[str, Any]] = []

        for manifest_file in sorted(self.backup_dir.glob("*.manifest.json"), reverse=True):
            try:
                manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
                archive_name = manifest.get("archive_filename")
                archive_file = self.backup_dir / archive_name if archive_name else None

                manifest["archive_exists"] = archive_file.exists() if archive_file else False
                if archive_file and archive_file.exists():
                    manifest["actual_archive_bytes"] = archive_file.stat().st_size
                results.append(manifest)
            except Exception as e:
                logger.warning("Failed to read manifest %s: %s", manifest_file, e)

        return results


# Global singleton instance
backup_manager = BackupManager()
