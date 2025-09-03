from __future__ import annotations
import asyncio, logging
from datetime import timedelta
from pathlib import Path
from app.core.config import settings
from app.core.telemetry import aspan
from app.services.storage_service import purge_old_files

log = logging.getLogger("retention")

async def retention_loop():
    if not settings.ENABLE_RETENTION:
        log.info("retention disabled")
        return
    interval_s = max(1, int(settings.RETENTION_SWEEP_MINUTES)) * 60
    base = Path(settings.STORAGE_DIR)
    log.info("retention loop started: every %s min", settings.RETENTION_SWEEP_MINUTES)
    while True:
        try:
            older_than = timedelta(days=settings.RETENTION_DAYS)
            async with aspan("retention_sweep_loop", base=str(base), days=settings.RETENTION_DAYS):
                purge_old_files(base, older_than)
        except Exception:
            log.exception("retention sweep failed")
        await asyncio.sleep(interval_s)
