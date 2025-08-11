import os
from pathlib import Path
from fastapi import UploadFile
from app.core.config import settings

async def save_upload(file: UploadFile) -> str:
    os.makedirs(settings.STORAGE_DIR, exist_ok=True)
    dest = Path(settings.STORAGE_DIR) / file.filename
    # overwrite in dev; in prod, add UUID
    with dest.open("wb") as f:
        content = await file.read()
        f.write(content)
    await file.seek(0)
    return str(dest.resolve())
