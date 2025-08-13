from __future__ import annotations
from pathlib import Path
from fastapi import APIRouter, HTTPException, Path as PathParam
from fastapi.responses import FileResponse

from app.models.schemas.export import ExportRequest, ExportResponse
from app.services.export_service import export_to_pptx
from app.core.telemetry import aspan, span

router = APIRouter(prefix="/export", tags=["export"])

# Use absolute path to avoid cwd surprises
_EXPORT_DIR = Path("data/exports").resolve()

def _media_type_for(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pptx":
        return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    if ext == ".txt":
        return "text/plain; charset=utf-8"
    return "application/octet-stream"

@router.post("", response_model=ExportResponse, summary="Export slides to text")
async def export(req: ExportRequest) -> ExportResponse:
    theme = req.theme or "default"
    async with aspan("export_endpoint", theme=theme, slide_count=len(req.slides)):
        return await export_to_pptx(req.slides, theme=theme)

@router.get(
    "/{filename}",
    response_class=FileResponse,
    summary="Download an exported artifact",
)
def download(
    filename: str = PathParam(
        ...,
        description="Exported filename (e.g., deck_20250101_121314_default.txt)",
        # Whitelist exact export naming we produce
        pattern=r"^deck_\d{8}_\d{6}_[A-Za-z0-9_-]+\.(txt|pptx)$",
    )
):
    # Normalize to the bare filename (blocks "../" in the param)
    safe_name = Path(filename).name
    candidate = (_EXPORT_DIR / safe_name)

    # Resolve and ensure the file stays inside _EXPORT_DIR (guards symlink escape)
    try:
        resolved = candidate.resolve(strict=True)
    except FileNotFoundError:
        raise HTTPException(404, "not found")

    try:
        resolved.relative_to(_EXPORT_DIR)
    except ValueError:
        raise HTTPException(400, "invalid path")

    media_type = _media_type_for(resolved)
    size = resolved.stat().st_size

    with span("export_download", filename=safe_name, bytes=size, media=media_type):
        return FileResponse(
            str(resolved),
            media_type=media_type,
            filename=safe_name,  # triggers browser download
        )
