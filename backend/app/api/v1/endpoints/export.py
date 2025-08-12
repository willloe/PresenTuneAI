from __future__ import annotations
from pathlib import Path
from fastapi import APIRouter, HTTPException, Path as PathParam
from fastapi.responses import FileResponse
from app.models.schemas.export import ExportRequest, ExportResponse
from app.services.export_service import export_to_pptx
from app.core.telemetry import aspan

router = APIRouter(prefix="/export", tags=["export"])

_EXPORT_DIR = Path("data/exports")

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
        pattern=r"^deck_\d{8}_\d{6}_[A-Za-z0-9_-]+\.(txt|pptx)$",
    )
):
    # Prevent path traversal: strip any directories
    safe_name = Path(filename).name
    fpath = _EXPORT_DIR / safe_name
    if not fpath.is_file():
        raise HTTPException(404, "not found")

    ext = fpath.suffix.lower()
    if ext == ".txt":
        media_type = "text/plain; charset=utf-8"
    elif ext == ".pptx":
        media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    else:
        media_type = "application/octet-stream"

    return FileResponse(
        str(fpath),
        media_type=media_type,
        filename=safe_name,  # triggers browser download
    )
