from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import re

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
        s = _LEAD_NUM.sub("", s)          # drop leading numbering (1., 1), I., etc.)
        s = _WS.sub(" ", s)               # normalize spaces
        s = s.strip(" -—•·")              # trim punctuation
        if len(s) < 4:
            continue
        if s.lower() in _BAD_LINES:
            continue
        seeds.append(s)
    return seeds

@router.post("/outline", response_model=OutlineResponse, summary="Return placeholder outline")
def outline(req: OutlineRequest) -> OutlineResponse:
    source = (req.text or "").strip()
    if not source and not req.topic:
        raise HTTPException(400, "Provide either 'text' or 'topic'")

    n = max(1, min(req.slide_count, 15))

    seeds = _seed_lines(source)
    base_title = (req.topic or (seeds[0] if seeds else "Untitled")).strip()

    slides: List[Slide] = []
    for i in range(n):
        seed = seeds[i % len(seeds)] if seeds else base_title
        title = f"Slide {i+1}: {_clip(seed)}"
        slides.append(Slide(title=title, bullets=["placeholder bullet"]))  # UI renders list bullets
    return OutlineResponse(slides=slides)
