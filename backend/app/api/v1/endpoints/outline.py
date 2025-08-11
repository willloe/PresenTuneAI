from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["outline"])

class OutlineRequest(BaseModel):
    topic: str | None = None
    text: str | None = None
    slide_count: int = 5

class Slide(BaseModel):
    title: str
    bullets: list[str] = []

class OutlineResponse(BaseModel):
    slides: list[Slide]

@router.post("/outline", response_model=OutlineResponse, summary="Return placeholder outline")
def outline(req: OutlineRequest) -> OutlineResponse:
    # Prefer parsed text if available; fall back to topic
    source = (req.text or "").strip()
    if not source and not req.topic:
        raise HTTPException(400, "Provide either 'text' or 'topic'")

    n = max(1, min(req.slide_count, 15))
    base_title = (req.topic or (source.splitlines()[0][:60] if source else "Untitled")).strip()

    slides = []
    # Extremely simple heuristic: derive section-like titles from text lines, else generic
    seeds = [ln.strip() for ln in source.splitlines() if ln.strip()] or [base_title]
    for i in range(n):
        title = f"Slide {i+1}: {seeds[i % len(seeds)][:80]}" if seeds else f"Slide {i+1}: {base_title}"
        slides.append(Slide(title=title, bullets=["• placeholder bullet"]))
    return OutlineResponse(slides=slides)
