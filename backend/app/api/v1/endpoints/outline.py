from fastapi import APIRouter
from app.models.schemas.outline import OutlineRequest, OutlineResponse
from app.services.outline_service import build_outline_placeholder

router = APIRouter(prefix="/outline", tags=["outline"])

@router.post("", response_model=OutlineResponse)
async def outline(req: OutlineRequest):
    # Week 1: placeholder logic; Week 2: call model/agent
    slides = await build_outline_placeholder(req.text, req.slide_count)
    return OutlineResponse(slides=slides)
