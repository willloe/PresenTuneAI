from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from app.models.schemas.export import ExportRequest, ExportResponse
from app.services.export_service import export_to_pptx
from app.core.telemetry import aspan

router = APIRouter(prefix="/export", tags=["export"])


@router.post("", response_model=ExportResponse, summary="Export slides to text")
async def export(req: ExportRequest) -> ExportResponse:
    theme = req.theme or "default"
    async with aspan("export_endpoint", theme=theme, slide_count=len(req.slides)):
        return await export_to_pptx(req.slides, theme=theme)


@router.get("/{filename}", response_class=FileResponse)
def download(filename: str):
    p = Path("data/exports") / filename
    if not p.is_file():
        raise HTTPException(404, "not found")
    return FileResponse(str(p), media_type="text/plain", filename=filename)
