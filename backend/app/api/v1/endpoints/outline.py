from fastapi import APIRouter, HTTPException, Request, Path, Depends
import logging

from app.models.schemas.outline import OutlineRequest
from app.models.schemas.slide import Deck, Slide
from app.services.outline_service import build_outline_service
from app.core.auth import require_token
from app.core.config import settings

router = APIRouter(tags=["outline"], dependencies=([Depends(require_token)] if settings.AUTH_ENABLED else []))
log = logging.getLogger("app")

_service = build_outline_service()

@router.post(
    "/outline",
    response_model=Deck,
    summary="Generate a deck (agent or placeholder, with fallback)",
)
async def outline(req: OutlineRequest, request: Request) -> Deck:
    if not (req.topic or req.text):
        raise HTTPException(400, "Provide either 'text' or 'topic'")
    deck = await _service.generate_deck(req)
    log.info("outline_complete", extra={"slide_count": deck.slide_count})
    return deck

@router.post(
    "/outline/{index}/regenerate",
    response_model=Slide,
    summary="Regenerate a single slide",
)
async def regenerate_slide(
    index: int = Path(..., ge=0, description="0-based slide index"),
    req: OutlineRequest | None = None,
) -> Slide:
    if req is None or not (req.topic or req.text):
        raise HTTPException(400, "Provide either 'text' or 'topic'")
    slide = await _service.regenerate_slide(index, req)
    log.info("outline_regenerate_complete", extra={"index": index})
    return slide
