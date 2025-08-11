from fastapi import APIRouter
from datetime import timedelta
from app.core.config import settings
from app.services.storage_service import purge_old_files

router = APIRouter(tags=["ops"])

@router.post("/ops/retention/sweep")
def retention_sweep():
    deleted = purge_old_files(settings.STORAGE_DIR, timedelta(days=settings.RETENTION_DAYS))
    return {"deleted": [str(p) for p in deleted], "count": len(deleted)}
