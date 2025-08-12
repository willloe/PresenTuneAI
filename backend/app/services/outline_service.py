from __future__ import annotations
import os, uuid, logging, re
from dataclasses import dataclass
from typing import List, Optional
from datetime import datetime

import httpx
from fastapi import HTTPException

from app.core.version import SCHEMA_VERSION
from app.core.telemetry import aspan
from app.models.schemas.outline import OutlineRequest
from app.models.schemas.slide import Deck, Slide

log = logging.getLogger("app")

# ---------- text cleanup ----------
_BAD_LINES = {"n", "contents", "table of contents", "toc", "index"}
_WS = re.compile(r"\s+")
_ARTIFACT = re.compile(r"\(cid:\d+\)")
_LEAD_NUM = re.compile(r"^[\s]*(?:\d+[\.\)]|[IVXLCM]+\.)\s+", re.IGNORECASE)
_BULLET_PREFIX = re.compile(r"^(\s*[-*\u2022\u00B7]\s*)+")

def _seed_lines(txt: str) -> List[str]:
    seeds: List[str] = []
    for ln in (txt or "").splitlines():
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

def _clip(s: str, n: int = 80) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else (s[: n - 1].rstrip() + "…")

_DEFAULT_HEADINGS = [
    "Overview", "Goals", "Key Points", "Approach", "Timeline",
    "Milestones", "Risks & Mitigations", "Resources", "Metrics", "Next Steps",
]

# ---------- strategies ----------
class OutlineStrategy:
    async def generate_deck(self, req: OutlineRequest) -> Deck: ...
    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide: ...

@dataclass
class PlaceholderStrategy(OutlineStrategy):
    async def _title_base(self, i: int, req: OutlineRequest) -> str:
        seeds = _seed_lines((req.text or "").strip())
        from_doc = bool(seeds)
        topic = (req.topic or ("Untitled" if not from_doc else seeds[0])).strip()
        if from_doc:
            return _clip(seeds[i % len(seeds)])
        heading = _DEFAULT_HEADINGS[i % len(_DEFAULT_HEADINGS)]
        return f"{_clip(topic)} — {heading}"

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        if not (req.topic or req.text):
            raise HTTPException(400, "Provide either 'text' or 'topic'")
        n = max(1, min(req.slide_count, 15))
        async with aspan("outline_placeholder_generate", slide_count=n):
            slides: List[Slide] = []
            for i in range(n):
                base = await self._title_base(i, req)
                slides.append(
                    Slide(
                        id=uuid.uuid4().hex,
                        title=f"Slide {i+1}: {base}",
                        bullets=["placeholder bullet"],
                        notes=None,
                        layout="title-bullets",
                        media=[],
                    )
                )
            return Deck(
                version=SCHEMA_VERSION,
                topic=(req.topic or "Untitled"),
                source=None,
                slide_count=len(slides),
                created_at=datetime.utcnow(),
                slides=slides,
            )

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        n = max(1, min(req.slide_count, 15))
        if index < 0 or index >= n:
            raise HTTPException(400, f"index {index} out of range for slide_count={n}")
        async with aspan("outline_placeholder_regenerate", index=index):
            base = await self._title_base(index, req)
            return Slide(
                id=uuid.uuid4().hex,
                title=f"Slide {index+1}: {base}",
                bullets=["placeholder bullet"],
                notes=None,
                layout="title-bullets",
                media=[],
            )

@dataclass
class AgentStrategy(OutlineStrategy):
    url: str
    timeout_ms: int = 10000

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        payload = req.model_dump()
        async with httpx.AsyncClient(timeout=self.timeout_ms / 1000) as client:
            r = await client.post(self.url.rstrip("/") + "/outline", json=payload)
            r.raise_for_status()
            data = r.json()
        return Deck.model_validate(data)

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        payload = req.model_dump()
        async with httpx.AsyncClient(timeout=self.timeout_ms / 1000) as client:
            r = await client.post(self.url.rstrip("/") + f"/outline/{index}/regenerate", json=payload)
            r.raise_for_status()
            data = r.json()
        return Slide.model_validate(data)

@dataclass
class OutlineService:
    primary: OutlineStrategy
    fallback: OutlineStrategy

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        try:
            return await self.primary.generate_deck(req)
        except Exception:
            log.warning("outline primary failed; using fallback", exc_info=True)
            return await self.fallback.generate_deck(req)

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        try:
            return await self.primary.regenerate_slide(index, req)
        except Exception:
            log.warning("outline regen primary failed; using fallback", exc_info=True)
            return await self.fallback.regenerate_slide(index, req)

def build_outline_service() -> OutlineService:
    use_agent = os.getenv("FEATURE_USE_AGENT", "false").lower() == "true"
    if use_agent:
        url = os.getenv("AGENT_URL", "").strip()
        if url:
            return OutlineService(primary=AgentStrategy(url=url), fallback=PlaceholderStrategy())
        log.error("FEATURE_USE_AGENT=true but AGENT_URL empty; defaulting to placeholder")
    return OutlineService(primary=PlaceholderStrategy(), fallback=PlaceholderStrategy())
