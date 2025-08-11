from fastapi import APIRouter
from app.models.schemas.export import ExportRequest, ExportResponse
from app.services.export_service import export_to_pptx

router = APIRouter(prefix="/export", tags=["export"])

@router.post("", response_model=ExportResponse)
async def export(req: ExportRequest):
    path = await export_to_pptx(req.slides, theme=req.theme or "default")
    return ExportResponse(path=path)
