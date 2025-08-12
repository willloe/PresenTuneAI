from fastapi import APIRouter, HTTPException, Request
from typing import List
from datetime import datetime
import re, uuid, logging

from app.models.schemas.slide import Deck, Slide
from app.models.schemas.outline import OutlineRequest
from app.core.version import SCHEMA_VERSION


router = APIRouter(tags=["outline"])
log = logging.getLogger("app")

# lines to ignore as titles
_BAD_LINES = {"n", "contents", "table of contents", "toc", "index"}

_BULLET_PREFIX = re.compile(r"^(\s*[-*\u2022\u00B7]\s*)+")       # -,*,•,·
_WS = re.compile(r"\s+")
_ARTIFACT = re.compile(r"\(cid:\d+\)")                           # e.g. (cid:127)
_LEAD_NUM = re.compile(r"^[\s]*(?:\d+[\.\)]|[IVXLCM]+\.)\s+", re.IGNORECASE)

def _clip(s: str, n: int = 80) -> str:
    s = s.strip()
    return s if len(s) <= n else (s[: n - 1].rstrip() + "…")

def _seed_lines(txt: str) -> List[str]:
    seeds: List[str] = []
    for ln in txt.splitlines():
        s = ln.strip()
        if not s:
            continue
        s = _ARTIFACT.sub("", s)          # drop (cid:###)
        s = _BULLET_PREFIX.sub("", s)     # drop bullet glyphs
        s = _LEAD_NUM.sub("", s)          # drop leading numbering
        s = _WS.sub(" ", s).strip(" -—•·")# normalize/trim
        if len(s) < 4:
            continue
        if s.lower() in _BAD_LINES:
            continue
        seeds.append(s)
    return seeds

@router.post("/outline", response_model=Deck, summary="Return placeholder deck")
def outline(req: OutlineRequest, request: Request) -> Deck:
    # accept either parsed text or topic
    source = (req.text or "").strip()
    if not source and not req.topic:
        raise HTTPException(400, "Provide either 'text' or 'topic'")

    n = max(1, min(req.slide_count, 15))
    seeds = _seed_lines(source)
    topic = (req.topic or (seeds[0] if seeds else "Untitled")).strip()

    # Build slides with IDs so the UI can key/edit them later
    slides: List[Slide] = []
    for i in range(n):
        seed = seeds[i % len(seeds)] if seeds else topic
        title = f"Slide {i+1}: {_clip(seed)}"
        slides.append(Slide(id=uuid.uuid4().hex, title=title, bullets=["placeholder bullet"]))

    deck = Deck(
        version=SCHEMA_VERSION,
        topic=topic,
        source=None,
        slide_count=len(slides),
        created_at=datetime.utcnow(),
        slides=slides,
    )

    # Optional: step log (request_id is added by observability middleware)
    req_id = getattr(getattr(request, "state", None), "request_id", None)
    log.info("outline_stub_complete", extra={"request_id": req_id, "slide_count": len(slides)})

    return deck
