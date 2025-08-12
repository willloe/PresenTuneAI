from fastapi import APIRouter
from datetime import datetime, timezone
from app.core.version import SCHEMA_VERSION

router = APIRouter(tags=["health"])

@router.get("/health")
def health():
    return {
        "status": "ok",
        "schema_version": SCHEMA_VERSION,
        "time": datetime.now(timezone.utc).isoformat(),
    }
