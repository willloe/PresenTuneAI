import os
from pathlib import Path
from datetime import timedelta
import time
import logging
from fastapi import UploadFile
from app.core.config import settings

log = logging.getLogger("retention")

def purge_old_files(base_dir: Path, older_than: timedelta) -> list[Path]:
    """
    Delete files in base_dir older than 'older_than'. Returns list of deleted paths.
    Ignores subdirs and logs but never raises (safe for background use).
    """
    deleted: list[Path] = []
    try:
        base = Path(base_dir)
        if not base.exists():
            return deleted
        cutoff = time.time() - older_than.total_seconds()
        for p in base.iterdir():
            if not p.is_file():
                continue
            try:
                if p.stat().st_mtime < cutoff:
                    p.unlink(missing_ok=True)
                    deleted.append(p)
            except Exception as e:
                log.warning("skip %s: %s", p, e)
    except Exception as e:
        log.error("retention scan failed in %s: %s", base_dir, e)
    return deleted

async def save_upload(file: UploadFile) -> str:
    os.makedirs(settings.STORAGE_DIR, exist_ok=True)
    dest = Path(settings.STORAGE_DIR) / file.filename
    # overwrite in dev; in prod, add UUID
    with dest.open("wb") as f:
        content = await file.read()
        f.write(content)
    await file.seek(0)
    return str(dest.resolve())
