from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from uuid import uuid4
from pydantic import BaseModel as PydModel
from app.core.config import settings
from app.core.telemetry import aspan, span
from app.services.parsing_service import parse_file
from app.models.schemas.upload import UploadResponse, ParsedPreview

router = APIRouter(tags=["upload"])

CHUNK = 1024 * 1024  # 1MB


@router.post(
    "/upload",
    response_model=UploadResponse,
    summary="Upload a document and return parsed preview",
)
async def upload(request: Request, file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename:
        raise HTTPException(400, "Missing filename")

    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    dest_dir = settings.STORAGE_DIR
    dest_dir.mkdir(parents=True, exist_ok=True)

    file_id = uuid4().hex
    dest_path = dest_dir / f"{file_id}_{file.filename}"

    # Stream to disk with size cap
    size = 0
    async with aspan(
        "upload_stream",
        file_name=file.filename,
        content_type=file.content_type or "application/octet-stream",
    ):
        with dest_path.open("wb") as f:
            while True:
                chunk = await file.read(CHUNK)
                if not chunk:
                    break
                size += len(chunk)
                if size > limit:
                    dest_path.unlink(missing_ok=True)
                    raise HTTPException(
                        413, f"File too large (> {settings.MAX_UPLOAD_MB} MB)"
                    )
                f.write(chunk)
        await file.seek(0)

    # Parse
    with span(
        "parse_file_endpoint",
        file=str(dest_path),
        content_type=file.content_type or "unknown",
    ):
        raw = parse_file(dest_path, file.content_type)

    # Normalize to ParsedPreview without double-wrapping
    if isinstance(raw, ParsedPreview):
        parsed = raw
    elif isinstance(raw, PydModel):
        parsed = ParsedPreview.model_validate(raw.model_dump())
    elif isinstance(raw, dict):
        parsed = ParsedPreview.model_validate(raw)
    else:
        # ultra-defensive fallback
        parsed = ParsedPreview()

    path_out = str(dest_path) if settings.DEBUG else None

    return UploadResponse(
        filename=file.filename,
        size=size,
        content_type=file.content_type or "application/octet-stream",
        path=path_out,
        parsed=parsed,
    )
