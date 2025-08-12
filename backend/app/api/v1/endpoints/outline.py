from fastapi import APIRouter, HTTPException, Request, Path
from typing import List
from datetime import datetime
import logging
import re
import uuid

from app.models.schemas.slide import Deck, Slide
from app.models.schemas.outline import OutlineRequest
from app.core.version import SCHEMA_VERSION
from app.core.telemetry import span

router = APIRouter(tags=["outline"])
log = logging.getLogger("app")

_BAD_LINES = {"n", "contents", "table of contents", "toc", "index"}
_BULLET_PREFIX = re.compile(r"^(\s*[-*\u2022\u00B7]\s*)+")
_WS = re.compile(r"\s+")
_ARTIFACT = re.compile(r"\(cid:\d+\)")
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
        s = _ARTIFACT.sub("", s)
        s = _BULLET_PREFIX.sub("", s)
        s = _LEAD_NUM.sub("", s)
        s = _WS.sub(" ", s).strip(" -—•·")
        if len(s) < 4:
            continue
        if s.lower() in _BAD_LINES:
            continue
        seeds.append(s)
    return seeds


@router.post(
    "/outline",
    response_model=Deck,
    summary="Generate a placeholder deck from topic/text",
)
def outline(req: OutlineRequest, request: Request) -> Deck:
    source = (req.text or "").strip()
    if not source and not req.topic:
        raise HTTPException(400, "Provide either 'text' or 'topic'")

    n = max(1, min(req.slide_count, 15))
    seeds = _seed_lines(source)
    topic = (req.topic or (seeds[0] if seeds else "Untitled")).strip()

    with span("outline_stub_build", topic=topic, slide_count=n):
        slides: List[Slide] = []
        for i in range(n):
            seed = seeds[i % len(seeds)] if seeds else topic
            title = f"Slide {i + 1}: {_clip(seed)}"
            slides.append(
                Slide(id=uuid.uuid4().hex, title=title, bullets=["placeholder bullet"])
            )

        deck = Deck(
            version=SCHEMA_VERSION,
            topic=topic,
            source=None,
            slide_count=len(slides),
            created_at=datetime.utcnow(),
            slides=slides,
        )

    log.info("outline_stub_complete", extra={"slide_count": len(slides)})
    return deck

@router.post(
    "/outline/{index}/regenerate",
    response_model=Slide,
    summary="Regenerate a single slide (placeholder)",
)
def regenerate_slide(
    index: int = Path(..., ge=0, description="0-based slide index"),
    req: OutlineRequest = None,
    request: Request = None,
) -> Slide:
    if req is None:
        raise HTTPException(400, "Missing request body")
    if not (req.topic or req.text):
        raise HTTPException(400, "Provide either 'text' or 'topic'")

    n = max(1, min(req.slide_count, 15))
    if index >= n:
        raise HTTPException(400, f"index {index} out of range for slide_count={n}")

    seeds = _seed_lines((req.text or "").strip())
    topic = (req.topic or (seeds[0] if seeds else "Untitled")).strip()
    seed = seeds[index % len(seeds)] if seeds else topic

    with span("outline_slide_regenerate", topic=topic, index=index):
        new_slide = Slide(
            id=uuid.uuid4().hex,
            title=f"Slide {index + 1}: {_clip(seed)}",
            bullets=[
                "placeholder bullet",  # deterministic stub
            ],
        )

    log.info("outline_slide_regenerate_complete", extra={"index": index})
    return new_slide