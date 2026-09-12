#!/usr/bin/env python3
"""SolarMesh CLI Backup & Disaster Recovery Runner.

Usage:
  # Create a compressed backup with default 30-day retention pruning:
  python scripts/backup_runner.py --backup

  # Create a labeled backup:
  python scripts/backup_runner.py --backup --label pre_migration_v2

  # List all existing backup archives:
  python scripts/backup_runner.py --list

  # Verify an archive's SHA-256 and payload integrity:
  python scripts/backup_runner.py --verify backups/backup_20260913_000000_abc123.json.gz

  # Restore a database from an archive:
  python scripts/backup_runner.py --restore backups/backup_20260913_000000_abc123.json.gz

  # Prune backups older than 14 days:
  python scripts/backup_runner.py --prune --retention-days 14
"""
import argparse
import json
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from app.backup_manager import backup_manager


def main():
    parser = argparse.ArgumentParser(description="SolarMesh Disaster Recovery & Database Backup Runner")
    parser.add_argument("--backup", action="store_true", help="Create a new logical database backup")
    parser.add_argument("--label", type=str, default=None, help="Optional descriptive label for backup archive")
    parser.add_argument("--retention-days", type=int, default=30, help="Retention period in days (default: 30)")
    parser.add_argument("--list", action="store_true", help="List available backup archives")
    parser.add_argument("--verify", type=str, help="Verify SHA-256 and readability of a backup archive path")
    parser.add_argument("--restore", type=str, help="Restore database from specified backup archive path")
    parser.add_argument("--prune", action="store_true", help="Prune backups older than retention-days")
    parser.add_argument("--no-compress", action="store_true", help="Store backup uncompressed (default: gzip)")

    args = parser.parse_args()

    if args.backup:
        print(f"[*] Initiating SolarMesh logical backup (retention: {args.retention_days} days)...")
        manifest = backup_manager.create_backup(
            label=args.label,
            retention_days=args.retention_days,
            compress=not args.no_compress,
        )
        print(f"[+] Backup created successfully!")
        print(f"    • ID:        {manifest['backup_id']}")
        print(f"    • Archive:   {manifest['archive_filename']}")
        print(f"    • SHA-256:   {manifest['sha256']}")
        print(f"    • Rows:      {manifest['total_rows']}")
        print(f"    • Size:      {manifest['archive_bytes'] / 1024:.2f} KB (compressed)")
        sys.exit(0)

    elif args.list:
        backups = backup_manager.list_backups()
        if not backups:
            print("No backup archives found in", backup_manager.backup_dir)
            sys.exit(0)
        print(f"Found {len(backups)} backup archive(s) in {backup_manager.backup_dir}:\n")
        print(f"{'Backup ID':<38} {'Created At (UTC)':<24} {'Rows':<8} {'Size (KB)':<10} {'SHA-256 (first 8)':<10}")
        print("-" * 95)
        for b in backups:
            size_kb = f"{b.get('archive_bytes', 0) / 1024:.1f}"
            sha_short = (b.get('sha256') or "")[:8]
            print(f"{b.get('backup_id', ''):<38} {b.get('created_at_utc', ''):<24} {b.get('total_rows', 0):<8} {size_kb:<10} {sha_short:<10}")
        sys.exit(0)

    elif args.verify:
        archive_path = Path(args.verify)
        print(f"[*] Verifying archive: {archive_path}...")
        valid, reason = backup_manager.verify_backup(archive_path)
        if valid:
            print(f"[+] [PASS] Integrity verified: {reason}")
            sys.exit(0)
        else:
            print(f"[-] [FAIL] Verification failed: {reason}")
            sys.exit(1)

    elif args.restore:
        archive_path = Path(args.restore)
        print(f"[!] WARNING: Restoring database from archive: {archive_path}")
        confirm = input("This will replace all current database records. Proceed? (y/N): ")
        if confirm.lower() != "y":
            print("Aborted.")
            sys.exit(0)

        print("[*] Executing database restoration...")
        result = backup_manager.restore_backup(archive_path)
        print(f"[+] Restoration Complete!")
        print(f"    • Restored ID:    {result['backup_id']}")
        print(f"    • Total Rows:     {result['total_rows_restored']}")
        print(f"    • Timestamp:      {result['restored_at_utc']}")
        sys.exit(0)

    elif args.prune:
        print(f"[*] Pruning backups older than {args.retention_days} days...")
        deleted = backup_manager.prune_backups(retention_days=args.retention_days)
        print(f"[+] Pruned {len(deleted)} file(s).")
        sys.exit(0)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
