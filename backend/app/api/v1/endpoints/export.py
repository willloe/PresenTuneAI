from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional, Iterable

from fastapi import APIRouter, HTTPException, Depends, Path as PathParam, Request
from fastapi.responses import FileResponse

from app.core.auth import require_token
from app.core.config import settings
from app.core.telemetry import aspan, span
from app.models.schemas.export import ExportRequest, ExportResponse
from app.services.export_service import export_to_pptx

log = logging.getLogger("app.export")

DATA_ROOT = Path(settings.STORAGE_DIR).parent.resolve()     # <…>/data
_EXPORT_DIR = (DATA_ROOT / "exports").resolve()             # <…>/data/exports
_EXPORT_DIR.mkdir(parents=True, exist_ok=True)

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
    yield _EXPORT_DIR
    yield settings.STORAGE_DIR / "exports"         # legacy
    yield DATA_ROOT / "uploads" / "exports"        # legacy alt
    yield Path.cwd()
    yield Path("/tmp")

def _find_by_name(name: str) -> Optional[Path]:
    name = Path(name).name
    for root in _candidate_roots():
        try:
            p = (root / name).resolve()
        except Exception:
            continue
        if p.exists() and p.is_file():
            return p
    # light rglob fallback
    for root in {DATA_ROOT, Path.cwd()}:
        try:
            for p in root.rglob(name):
                if p.is_file():
                    return p
        except Exception:
            pass
    return None

def _normalize_to_exports(src: Path, as_name: str) -> Path:
    dst = (_EXPORT_DIR / Path(as_name).name).resolve()
    if src.resolve() != dst:
        dst.write_bytes(src.read_bytes())
    return dst

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

    # Derive filename RELIABLY from the path the exporter returned
    src_path_str = getattr(res, "path", "") or ""
    if not src_path_str:
        raise HTTPException(500, "Exporter returned no path")
    src_path = Path(src_path_str).resolve()
    filename = src_path.name

    # Ensure the file exists; if not, search all likely places by name
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
        setattr(res, "download_url", download_url)

    with span("export_ready", filename=filename, path=str(final_path), bytes=final_path.stat().st_size):
        pass

    return res

@router.get(
    "/{filename}",
    response_class=FileResponse,
    summary="Download a previously exported file by filename",
)
def download(
    filename: str = PathParam(
        ..., pattern=r"^[A-Za-z0-9._-]+\.(pptx|txt)$",
        description="Exported filename (e.g. deck_20250101_121314_default.pptx)",
    )
):
    safe = Path(filename).name

    found = _find_by_name(safe)
    if found is None:
        with span("export_download_miss", filename=safe):
            raise HTTPException(404, "Export not found")

    # Re-home into canonical dir for future requests
    try:
        if found.parent.resolve() != _EXPORT_DIR:
            found = _normalize_to_exports(found, safe)
    except Exception:
        pass

    media_type = _media_type_for(found)
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
