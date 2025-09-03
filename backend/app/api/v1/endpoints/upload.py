from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Depends, Response
from uuid import uuid4
from pathlib import Path
from pydantic import BaseModel as PydModel

from app.core.config import settings
from app.core.telemetry import aspan, span
from app.services.parsing_service import parse_file, extract_images
from app.services.asset_store import load_assets, save_assets
from app.models.schemas.upload import UploadResponse, ParsedPreview
from app.core.auth import require_token

router = APIRouter(
    tags=["upload"],
    dependencies=([Depends(require_token)] if settings.AUTH_ENABLED else [])
)

CHUNK = 1024 * 1024  # 1MB


@router.post(
    "/upload",
    response_model=UploadResponse,
    summary="Upload a document and return parsed preview",
)
async def upload(request: Request, response: Response, file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename:
        raise HTTPException(400, "Missing filename")

    limit = settings.MAX_UPLOAD_MB * 1024 * 1024
    base_dir: Path = settings.STORAGE_DIR  # expect: data/uploads
    base_dir.mkdir(parents=True, exist_ok=True)

    # Per-upload directory so the PDF and extracted assets live together
    upload_id = uuid4().hex
    upload_dir = base_dir / upload_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    dest_path = upload_dir / file.filename

    # --- Stream upload to disk with size cap
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
                    raise HTTPException(413, f"File too large (> {settings.MAX_UPLOAD_MB} MB)")
                f.write(chunk)
        await file.seek(0)

    # --- Parse text/pages (existing logic)
    content_type = file.content_type or "application/octet-stream"
    with span("parse_file_endpoint", file=str(dest_path), content_type=content_type):
        raw = parse_file(dest_path, content_type)

    # Normalize to ParsedPreview without double-wrapping
    if isinstance(raw, ParsedPreview):
        parsed = raw
    elif isinstance(raw, PydModel):
        parsed = ParsedPreview.model_validate(raw.model_dump())
    elif isinstance(raw, dict):
        parsed = ParsedPreview.model_validate(raw)
    else:
        parsed = ParsedPreview()

    # --- Extract images (soft-fail; upload should still succeed)
    assets_dir = upload_dir / "assets"
    new_assets = []
    try:
        new_assets = extract_images(
            str(dest_path),
            str(assets_dir),
            upload_id,
            use_pdffigures2=settings.USE_PDFFIGURES2,
        )
    except Exception:
        # You can log this with your telemetry/logging if desired
        new_assets = []

    # Merge & persist index.json (idempotent)
    try:
        existing = load_assets(upload_id)
        by_id = {a.id: a for a in existing}
        for a in new_assets:
            by_id[a.id] = a
        save_assets(upload_id, list(by_id.values()))
    except Exception:
        # Don’t block response if the JSON index has an issue
        pass

    # Expose upload_id to the frontend without changing your schema
    response.headers["X-Upload-Id"] = upload_id

    # Only include absolute path in DEBUG
    path_out = str(dest_path) if settings.DEBUG else None

    return UploadResponse(
        filename=file.filename,
        size=size,
        content_type=content_type,
        path=path_out,
        parsed=parsed,
    )
