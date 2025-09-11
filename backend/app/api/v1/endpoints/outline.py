from fastapi import APIRouter, HTTPException, Request, Path, Depends
import logging

from app.models.schemas.outline import OutlineRequest
from app.models.schemas.slide import Deck, Slide
from app.services.outline_service import build_outline_service
from app.core.auth import require_token
from app.core.config import settings
from app.core.telemetry import aspan  # ⟵ add timing spans for Server-Timing

router = APIRouter(
    tags=["outline"],
    dependencies=([Depends(require_token)] if settings.AUTH_ENABLED else []),
)
log = logging.getLogger("app")

_service = build_outline_service()

@router.post(
    "/outline",
    response_model=Deck,
    summary="Generate a deck (agent or placeholder, with fallback)",
)
async def outline(req: OutlineRequest, request: Request) -> Deck:
    # Accept any of: topic, text, or upload_id (text will be resolved server-side)
    if not (req.topic or req.text or req.upload_id):
        raise HTTPException(400, "Provide one of 'upload_id', 'text' or 'topic'")

    strategy = "agent" if settings.FEATURE_USE_MODEL else "placeholder"
    async with aspan("outline_generate", strategy=strategy, slide_count=req.slide_count):
        deck = await _service.generate_deck(req)

    log.info("outline_complete", extra={"slide_count": deck.slide_count, "strategy": strategy})
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
    if req is None or not (req.topic or req.text or req.upload_id):
        raise HTTPException(400, "Provide one of 'upload_id', 'text' or 'topic'")

    if req.slide_count is not None and index >= req.slide_count:
        raise HTTPException(400, "index out of range for requested slide_count")

    async with aspan("outline_regenerate", index=index):
        slide = await _service.regenerate_slide(index, req)

    log.info("outline_regenerate_complete", extra={"index": index})
    return slide
