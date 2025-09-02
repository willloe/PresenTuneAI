from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Optional, Iterable

from fastapi import APIRouter, HTTPException, Depends, Path as PathParam, Request, Response
from fastapi.responses import FileResponse

from app.core.auth import require_token
from app.core.config import settings
from app.core.telemetry import aspan, span
from app.models.schemas.export import ExportRequest, ExportResponse
from app.services.export_service import export_to_pptx

log = logging.getLogger("app.export")

# STORAGE_DIR might be /app/data/uploads → DATA_ROOT = /app/data
DATA_ROOT: Path = Path(settings.STORAGE_DIR).parent.resolve()
# Canonical location where downloads are served from:
EXPORT_DIR: Path = (DATA_ROOT / "exports").resolve()
EXPORT_DIR.mkdir(parents=True, exist_ok=True)


router = APIRouter(
    prefix="/export", tags=["export"],
    dependencies=([Depends(require_token)] if settings.AUTH_ENABLED else []),
)


def _media_type_for(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pptx":
        return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    if ext == ".txt":
        return "text/plain; charset=utf-8"
    return "application/octet-stream"


def _candidate_roots() -> Iterable[Path]:
    # 1) Canonical (served from here)
    yield EXPORT_DIR
    # 2) Where the exporter currently writes, if different (e.g., STORAGE_DIR/exports)
    yield (Path(settings.STORAGE_DIR) / "exports").resolve()
    # 3) Legacy alt that some older builds used
    yield (DATA_ROOT / "uploads" / "exports").resolve()
    # 4) A couple of generic fallbacks
    yield Path.cwd().resolve()
    yield Path("/tmp").resolve()


def _find_by_name(name: str) -> Optional[Path]:
    """
    Find a file by name across our known export roots.
    Name is sanitized to just the basename.
    """
    name = Path(name).name
    # exact checks in candidate roots
    for root in _candidate_roots():
        try:
            p = (root / name).resolve()
        except Exception:
            continue
        if p.exists() and p.is_file():
            return p
    # last-ditch scan under data root or cwd
    for root in {DATA_ROOT, Path.cwd().resolve()}:
        try:
            for p in root.rglob(name):
                if p.is_file():
                    return p.resolve()
        except Exception:
            pass
    return None


def _normalize_to_exports(src: Path, as_name: str) -> Path:
    """
    Ensure the file lives under EXPORT_DIR with the expected name.
    Prefer atomic rename when possible; fall back to copy on cross-device moves.
    """
    dst = (EXPORT_DIR / Path(as_name).name).resolve()
    try:
        if src.resolve() == dst:
            return dst
    except Exception:
        pass

    # Try an atomic move first
    try:
        os.replace(src, dst)  # works if on same filesystem
        return dst
    except Exception:
        # Cross-device or permission issues → copy
        try:
            shutil.copy2(src, dst)
            return dst
        except Exception as e:
            log.exception("Failed to place export into canonical dir: %s → %s", src, dst)
            raise HTTPException(500, f"Failed to stage export: {type(e).__name__}") from e


@router.post("", response_model=ExportResponse, summary="Export slides or editor doc to PPTX")
async def export(req: Request, body: ExportRequest) -> ExportResponse:
    theme = body.theme or "default"
    count = len(body.slides or []) or len(getattr(body.editor, "slides", []) or [])
    if not count:
        raise HTTPException(400, "Provide either 'slides' or 'editor'")

    eff_theme_meta = body.theme_meta or (getattr(body.editor, "theme_meta", None) if body.editor else None)

    async with aspan("export_endpoint", theme=theme, slide_count=count):
        res: ExportResponse = await export_to_pptx(
            slides=body.slides, editor=body.editor, theme=theme, theme_meta=eff_theme_meta
        )

    # Exporter returns a filesystem path; derive the filename from it.
    src_path_str = getattr(res, "path", "") or ""
    if not src_path_str:
        raise HTTPException(500, "Exporter returned no path")
    src_path = Path(src_path_str)

    filename = src_path.name
    produced = src_path if src_path.exists() else _find_by_name(filename)
    if produced is None:
        with span("export_locate_failed", filename=filename, hint="path_missing", path=src_path_str):
            log.error("Exported file not found: %s", src_path_str)
        raise HTTPException(500, f"Exported file not found on disk: {filename}")

    # Normalize into canonical folder and publish a stable URL
    final_path = _normalize_to_exports(produced, filename)
    base = str(req.base_url).rstrip("/")
    download_url = f"{base}{settings.API_BASE}/export/{filename}"

    try:
        res = res.model_copy(update={"download_url": download_url})
    except Exception:
        # Pydantic v1 fallback or plain object
        setattr(res, "download_url", download_url)

    with span("export_ready", filename=filename, path=str(final_path), bytes=final_path.stat().st_size):
        pass

    return res


@router.api_route(
    "/{filename}",
    methods=["GET", "HEAD"],
    response_class=FileResponse,
    summary="Download a previously exported file by filename",
)
def download(request: Request,
             filename: str = PathParam(
                 ..., pattern=r"^[A-Za-z0-9._-]+\.(pptx|txt)$",
                 description="Exported filename (e.g. deck_20250101_121314_default.pptx)",
             )):
    safe = Path(filename).name

    found = _find_by_name(safe)
    if found is None:
        with span("export_download_miss", filename=safe):
            raise HTTPException(404, "Export not found")

    # Re-home into canonical dir for future requests
    try:
        if found.parent.resolve() != EXPORT_DIR:
            found = _normalize_to_exports(found, safe)
    except Exception:
        pass

    media_type = _media_type_for(found)

    # HEAD: return headers only (FastAPI will also do this automatically, but we add span clarity)
    if request.method == "HEAD":
        size = found.stat().st_size
        with span("export_head", filename=safe, path=str(found), bytes=size, media=media_type):
            return Response(status_code=200, headers={
                "content-type": media_type,
                "content-length": str(size),
                "content-disposition": f'attachment; filename="{safe}"',
            })

    with span("export_download", filename=safe, path=str(found), bytes=found.stat().st_size, media=media_type):
        return FileResponse(str(found), media_type=media_type, filename=safe)


# --- OPTIONAL: tiny debug helper
@router.get("/_debug/list")
def debug_list():
    out = {}
    for root in _candidate_roots():
        try:
            r = root.resolve()
            out[str(r)] = [p.name for p in sorted(r.glob("*.*")) if p.is_file()]
        except Exception:
            out[str(root)] = ["<unreadable>"]
    return out
