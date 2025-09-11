# app/routers/upload.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Depends, Response
from uuid import uuid4
from pathlib import Path
from pydantic import BaseModel as PydModel
from datetime import datetime, timezone
import json
import logging

from app.core.config import settings
from app.core.telemetry import aspan, span
from app.services.parsing_service import parse_file, extract_images
from app.services.asset_store import load_assets, save_assets
from app.models.schemas.upload import UploadResponse, ParsedPreview
from app.core.auth import require_token

log = logging.getLogger("app.upload")

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

    # Always resolve STORAGE_DIR to an absolute path to avoid cwd differences
    base_dir = Path(settings.STORAGE_DIR)
    if not base_dir.is_absolute():
        base_dir = Path.cwd() / base_dir
    base_dir.mkdir(parents=True, exist_ok=True)

    # Per-upload directory so the source file, parsed JSON, and extracted assets live together
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
                    try:
                        dest_path.unlink(missing_ok=True)
                    except Exception:
                        pass
                    raise HTTPException(413, f"File too large (> {settings.MAX_UPLOAD_MB} MB)")
                f.write(chunk)
        await file.seek(0)

    log.info("[upload] saved %s bytes to %s (upload_id=%s)", size, dest_path, upload_id)

    # --- Parse text/pages (EXPLICIT upload_root so parsed.json definitely lands in upload_dir)
    content_type = file.content_type or "application/octet-stream"
    with span("parse_file_endpoint", file=str(dest_path), content_type=content_type):
        raw = parse_file(dest_path, content_type, upload_root=upload_dir)

    # Normalize to ParsedPreview without double-wrapping
    if isinstance(raw, ParsedPreview):
        parsed = raw
    elif isinstance(raw, PydModel):
        parsed = ParsedPreview.model_validate(raw.model_dump())
    elif isinstance(raw, dict):
        parsed = ParsedPreview.model_validate(raw)
    else:
        parsed = ParsedPreview()

    # Persist preview helpers (parse_file already wrote parsed.json when upload_root is provided)
    try:
        # Handy for inspection
        (upload_dir / "parsed_text.txt").write_text(parsed.text or "", encoding="utf-8")

        # Lightweight preview JSON (parse_file also writes parsed_preview.json, but this is harmless)
        (upload_dir / "parsed_preview.json").write_text(
            json.dumps(
                {
                    "kind": parsed.kind,
                    "pages": parsed.pages,
                    "text_length": parsed.text_length,
                    "text_preview": parsed.text_preview,
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        # Safety net: if parsed.json wasn't created (should be), write it now
        parsed_json_path = upload_dir / "parsed.json"
        if not parsed_json_path.exists():
            parsed_json_path.write_text(
                json.dumps(
                    {
                        "kind": parsed.kind,
                        "pages": parsed.pages,
                        "text": parsed.text or "",
                        "text_length": parsed.text_length,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            log.warning("[upload] parsed.json was missing; wrote fallback at %s", parsed_json_path)
    except Exception as e:
        log.warning("[upload] non-fatal write error: %s", e)

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
    except Exception as e:
        log.warning("[upload] extract_images failed: %s", e)
        new_assets = []

    # Merge & persist index.json for assets (idempotent)
    try:
        existing = load_assets(upload_id)
        by_id = {a.id: a for a in existing}
        for a in new_assets:
            by_id[a.id] = a
        save_assets(upload_id, list(by_id.values()))
    except Exception as e:
        log.warning("[upload] save_assets failed (non-fatal): %s", e)

    # Lightweight manifest for the whole upload (source + parsed + assets)
    try:
        manifest = {
            "upload_id": upload_id,
            "filename": file.filename,
            "size": size,
            "content_type": content_type,
            "source_path": str(dest_path),
            "parsed_preview_path": str(upload_dir / "parsed_preview.json"),
            "parsed_text_path": str(upload_dir / "parsed_text.txt"),
            "assets_dir": str(assets_dir),
            "assets_index_path": str(assets_dir / "index.json"),
            "extracted_images_index": str(assets_dir / "extracted_images.json"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        (upload_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    except Exception as e:
        log.warning("[upload] manifest write failed (non-fatal): %s", e)

    # Expose upload_id via header (and expose it for browsers)
    response.headers["X-Upload-Id"] = upload_id
    response.headers["Access-Control-Expose-Headers"] = "X-Upload-Id"

    # Only include absolute path in DEBUG
    path_out = str(dest_path) if settings.DEBUG else None

    return UploadResponse(
        upload_id=upload_id,  # serialized as "uploadId" in JSON
        filename=file.filename,
        size=size,
        content_type=content_type,
        path=path_out,
        parsed=parsed,
    )
