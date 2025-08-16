from __future__ import annotations
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends, Path as PathParam
from fastapi.responses import FileResponse

from app.core.auth import require_token
from app.core.config import settings
from app.core.telemetry import aspan, span
from app.models.schemas.export import ExportRequest, ExportResponse
from app.services.export_service import export_to_pptx

_EXPORT_DIR = (Path(settings.STORAGE_DIR) / "exports").resolve()
_EXPORT_DIR.mkdir(parents=True, exist_ok=True)

router = APIRouter(
    prefix="/export", tags=["export"],
    dependencies=([Depends(require_token)] if settings.AUTH_ENABLED else []),
)

def _media_type_for(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    if ext == ".txt": return "text/plain; charset=utf-8"
    return "application/octet-stream"

@router.post("", response_model=ExportResponse, summary="Export slides or editor doc to PPTX")
async def export(req: ExportRequest) -> ExportResponse:
    theme = req.theme or "default"
    count = len(req.slides or []) or len(getattr(req.editor, "slides", []) or [])
    if not count:
        raise HTTPException(400, "Provide either 'slides' or 'editor'")
    async with aspan("export_endpoint", theme=theme, slide_count=count):
        return await export_to_pptx(slides=req.slides, editor=req.editor, theme=theme)

@router.get("/{filename}", response_class=FileResponse)
def download(
    filename: str = PathParam(
        ..., description="Exported filename (e.g. deck_20250101_121314_default.pptx)",
        pattern=r"^deck_\d{8}_\d{6}_[A-Za-z0-9_-]+\.(txt|pptx)$",
    )
):
    safe = Path(filename).name
    path = (_EXPORT_DIR / safe)
    try:
        resolved = path.resolve(strict=True)
        resolved.relative_to(_EXPORT_DIR)
    except FileNotFoundError:
        raise HTTPException(404, "not found")
    except ValueError:
        raise HTTPException(400, "invalid path")

    media_type = _media_type_for(resolved)
    with span("export_download", filename=safe, bytes=resolved.stat().st_size, media=media_type):
        return FileResponse(str(resolved), media_type=media_type, filename=safe)
