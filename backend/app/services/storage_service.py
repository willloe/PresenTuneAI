import os, time, logging
from pathlib import Path
from datetime import timedelta
from fastapi import UploadFile

from app.core.config import settings
from app.core.telemetry import span, aspan
from app.services.parsing_service import parse_file
from app.models.schemas.upload import UploadMeta, ParsedPreview

log = logging.getLogger("retention")

def purge_old_files(base_dir: Path, older_than: timedelta) -> list[Path]:
    deleted: list[Path] = []
    with span("retention_sweep", logger=log, base=str(base_dir), days=older_than.days):
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

async def save_upload(file: UploadFile) -> UploadMeta:
    os.makedirs(settings.STORAGE_DIR, exist_ok=True)
    dest = Path(settings.STORAGE_DIR) / file.filename

    async with aspan("save_upload", filename=file.filename, content_type=file.content_type or "unknown"):
        content = await file.read()
        size = len(content)
        with dest.open("wb") as f:
            f.write(content)
        await file.seek(0)

    # parse + wrap into schema
    parsed_dict = parse_file(dest, file.content_type)
    parsed = ParsedPreview(**parsed_dict) if isinstance(parsed_dict, dict) else parsed_dict

    return UploadMeta(
        filename=file.filename,
        size=size,
        content_type=file.content_type or "application/octet-stream",
        path=str(dest.resolve()) if settings.DEBUG else None,
        parsed=parsed,
    )
