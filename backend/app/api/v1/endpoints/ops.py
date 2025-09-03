from __future__ import annotations
from datetime import timedelta
from pathlib import Path
from fastapi import APIRouter, Depends
from app.core.auth import require_token
from app.core.config import settings
from app.core.telemetry import aspan
from app.services.storage_service import purge_old_files

router = APIRouter(
    prefix="/ops", tags=["ops"],
    dependencies=([Depends(require_token)] if settings.AUTH_ENABLED else [])
)

@router.post("/retention/sweep", summary="Run a retention sweep now")
def retention_sweep():
    if not settings.ENABLE_RETENTION:
        return {"enabled": False, "deleted": [], "count": 0}
    base = Path(settings.STORAGE_DIR)
    older_than = timedelta(days=settings.RETENTION_DAYS)
    with aspan("retention_manual_sweep", base=str(base), days=settings.RETENTION_DAYS):
        deleted = purge_old_files(base, older_than)
    return {"enabled": True, "deleted": [str(p) for p in deleted], "count": len(deleted)}
