from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from uuid import uuid4
from pathlib import Path
from app.core.config import settings
from app.services.parsing_service import parse_file

router = APIRouter(tags=["upload"])

class UploadResponse(BaseModel):
    file_id: str
    filename: str
    size: int
    content_type: str | None
    storage_path: str
    parsed: dict

CHUNK = 1024 * 1024  # 1MB

@router.post("/upload", response_model=UploadResponse, summary="Upload a document and return parsed text")
async def upload(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "Missing filename")

    # enforce size cap while streaming to disk
    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    dest_dir = settings.STORAGE_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)

    file_id = uuid4().hex
    dest_path = dest_dir / f"{file_id}_{file.filename}"

    size = 0
    with dest_path.open("wb") as f:
        while True:
            chunk = await file.read(CHUNK)
            if not chunk:
                break
            size += len(chunk)
            if size > limit:
                dest_path.unlink(missing_ok=True)
                raise HTTPException(413, f"File too large (> {settings.MAX_UPLOAD_MB} MB)")
            f.write(chunk)

    parsed = parse_file(dest_path, file.content_type)

    return UploadResponse(
        file_id=file_id,
        filename=file.filename,
        size=size,
        content_type=file.content_type,
        storage_path=str(dest_path),
        parsed=parsed,
    )
