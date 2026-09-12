"""Admin backup and disaster recovery endpoints."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.backup_manager import backup_manager
from app.dependencies import require_admin
from app.models import User

router = APIRouter(prefix="/api/admin/backups", tags=["backups"])


class BackupTriggerRequest(BaseModel):
    label: Optional[str] = None
    retention_days: int = 30
    compress: bool = True


class BackupVerifyRequest(BaseModel):
    archive_filename: str


@router.get("", response_model=List[Dict[str, Any]])
def list_database_backups(
    admin: User = Depends(require_admin),
) -> List[Dict[str, Any]]:
    """List all available database backup archives with SHA-256 digests and row counts."""
    return backup_manager.list_backups()


@router.post("/trigger", status_code=status.HTTP_201_CREATED)
def trigger_database_backup(
    body: BackupTriggerRequest,
    admin: User = Depends(require_admin),
) -> Dict[str, Any]:
    """Trigger an immediate logical backup of the entire SolarMesh database."""
    manifest = backup_manager.create_backup(
        label=body.label,
        retention_days=body.retention_days,
        compress=body.compress,
    )
    return {
        "message": "Database backup created successfully.",
        "manifest": manifest,
    }


@router.post("/verify")
def verify_backup_integrity(
    body: BackupVerifyRequest,
    admin: User = Depends(require_admin),
) -> Dict[str, Any]:
    """Verify SHA-256 digest and payload integrity of an existing backup archive."""
    archive_path = backup_manager.backup_dir / body.archive_filename
    if not archive_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Backup archive '{body.archive_filename}' not found.",
        )

    is_valid, reason = backup_manager.verify_backup(archive_path)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Backup verification failed: {reason}",
        )

    return {
        "status": "VALID",
        "archive_filename": body.archive_filename,
        "detail": reason,
    }
