from __future__ import annotations
import os, uuid, logging, re
from dataclasses import dataclass
from typing import List
from datetime import datetime

import httpx
from fastapi import HTTPException

from app.core.version import SCHEMA_VERSION
from app.core.telemetry import aspan, span  # ⬅ added span for small response events
from app.models.schemas.outline import OutlineRequest
from app.models.schemas.slide import Deck, Slide, Media
from app.services.image_service import build_image_provider

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
            async with aspan("agent_outline_request", url=self.url, timeout_ms=self.timeout_ms):
                r = await client.post(self.url.rstrip("/") + "/outline", json=payload)
            # tiny response span to capture metadata
            with span("agent_outline_response", status=r.status_code, bytes=len(r.content)):
                ...
            r.raise_for_status()
            data = r.json()
        return Deck.model_validate(data)

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        payload = req.model_dump()
        async with httpx.AsyncClient(timeout=self.timeout_ms / 1000) as client:
            async with aspan("agent_regen_request", url=self.url, index=index, timeout_ms=self.timeout_ms):
                r = await client.post(self.url.rstrip("/") + f"/outline/{index}/regenerate", json=payload)
            with span("agent_regen_response", status=r.status_code, bytes=len(r.content), index=index):
                ...
            r.raise_for_status()
            data = r.json()
        return Slide.model_validate(data)

@dataclass
class OutlineService:
    primary: OutlineStrategy
    fallback: OutlineStrategy

    async def _enrich_images(self, deck: Deck) -> Deck:
        """
        Attach a deterministic image to each slide that lacks media.
        Controlled by FEATURE_IMAGE_API=true|false (default true).
        """
        if os.getenv("FEATURE_IMAGE_API", "true").lower() != "true":
            return deck

        provider = build_image_provider()
        provider_name = provider.__class__.__name__
        async with aspan("image_enrich_deck", slides=len(deck.slides), provider=provider_name):
            for idx, s in enumerate(deck.slides):
                if getattr(s, "media", None) and len(s.media) > 0:
                    continue  # already has media
                # Use title (minus 'Slide') as keyword; fallback to deck.topic
                kw = (s.title or "").replace("Slide", "").strip() or (deck.topic or "Presentation")
                async with aspan("image_enrich_slide", idx=idx, kw=kw):
                    try:
                        media = await provider.image_for(kw, idx)
                        if media:
                            # Ensure list container exists
                            if not getattr(s, "media", None):
                                s.media = []
                            s.media = [media]
                        else:
                            with span("image_enrich_miss", idx=idx, kw=kw):
                                ...
                    except Exception as e:
                        log.warning("image_enrich_error idx=%s kw=%s: %s", idx, kw, e)
                        with span("image_enrich_error", idx=idx, kw=kw, err=type(e).__name__):
                            ...
        return deck

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        """
        Orchestrates: primary strategy -> fallback on error -> image enrichment.
        Emits a top-level span for observability around the chosen strategy.
        """
        try:
            async with aspan("outline_generate", strategy=self.primary.__class__.__name__):
                deck = await self.primary.generate_deck(req)
        except Exception:
            log.warning("outline primary failed; using fallback", exc_info=True)
            async with aspan("outline_generate_fallback", strategy=self.fallback.__class__.__name__):
                deck = await self.fallback.generate_deck(req)

        # Post-process: attach images (feature-flagged)
        deck = await self._enrich_images(deck)
        return deck

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        """
        Regenerates a single slide via primary strategy with fallback,
        then enriches that slide with an image (feature-flagged).
        """
        try:
            async with aspan("outline_regenerate", strategy=self.primary.__class__.__name__, index=index):
                slide = await self.primary.regenerate_slide(index, req)
        except Exception:
            log.warning("outline regen primary failed; using fallback", exc_info=True)
            async with aspan("outline_regenerate_fallback", strategy=self.fallback.__class__.__name__, index=index):
                slide = await self.fallback.regenerate_slide(index, req)

        if os.getenv("FEATURE_IMAGE_API", "true").lower() == "true":
            provider = build_image_provider()
            kw = (slide.title or "").replace("Slide", "").strip() or (req.topic or "Presentation")
            async with aspan("image_enrich_slide", idx=index, kw=kw):
                try:
                    media = await provider.image_for(kw, index)
                    if media:
                        if not getattr(slide, "media", None):
                            slide.media = []
                        slide.media = [media]
                    else:
                        with span("image_enrich_miss", idx=index, kw=kw):
                            ...
                except Exception as e:
                    log.warning("image_enrich_error idx=%s kw=%s: %s", index, kw, e)
                    with span("image_enrich_error", idx=index, kw=kw, err=type(e).__name__):
                        ...
        return slide

def build_outline_service() -> OutlineService:
    use_agent = os.getenv("FEATURE_USE_MODEL", "false").lower() == "true"
    if use_agent:
        url = os.getenv("AGENT_URL", "").strip()
        if url:
            return OutlineService(primary=AgentStrategy(url=url), fallback=PlaceholderStrategy())
        log.error("FEATURE_USE_MODEL=true but AGENT_URL empty; defaulting to placeholder")
    return OutlineService(primary=PlaceholderStrategy(), fallback=PlaceholderStrategy())
