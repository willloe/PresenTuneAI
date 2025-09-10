# app/services/outline_service.py
from __future__ import annotations
import uuid, logging, re, json
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import HTTPException

from app.core.version import SCHEMA_VERSION
from app.core.telemetry import aspan, span
from app.core.config import settings
from app.models.schemas.outline import OutlineRequest
from app.models.schemas.slide import Deck, Slide, Media, Meta, ListSection
from app.services.image_service import build_image_provider  # back-compat alias

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

def _kw_from_title(title: str | None, topic_fallback: str | None) -> str:
    """Extract a useful keyword from a slide title like 'Slide 3: Topic — Heading'."""
    t = (title or "").strip()
    if ":" in t:
        t = t.split(":", 1)[1].strip()  # drop 'Slide N:'
    return t or (topic_fallback or "Presentation")

_DEFAULT_HEADINGS = [
    "Overview", "Goals", "Key Points", "Approach", "Timeline",
    "Milestones", "Risks & Mitigations", "Resources", "Metrics", "Next Steps",
]

# ---------- small disk helpers ----------
def _uploads_root() -> Path:
    # Expect settings.STORAGE_DIR → data/uploads
    # If STORAGE_DIR already points to data/uploads, we use it as-is.
    return Path(settings.STORAGE_DIR)

def _parsed_json_path(upload_id: str) -> Path:
    return _uploads_root() / upload_id / "parsed.json"

def _safe_load_json(p: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None

def _atomic_write_json(p: Path, data: Dict[str, Any]) -> None:
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(p)
    except Exception:
        # Non-fatal. We still proceed without blocking the response.
        pass

def _ensure_slides_target_on_disk(upload_id: Optional[str], slide_count: int, topic: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    If we can locate parsed.json, ensure it contains:
      - slides_target: <int>
      - topic: <str> (best-effort)
    Returns the JSON dict we ended up with (or None).
    """
    if not upload_id:
        return None
    path = _parsed_json_path(upload_id)
    data = _safe_load_json(path) or {}
    try:
        data["slides_target"] = int(slide_count)
    except Exception:
        pass
    if topic and not data.get("topic"):
        data["topic"] = topic
    _atomic_write_json(path, data)
    return data

# ---------- strategies ----------
class OutlineStrategy:
    async def generate_deck(self, req: OutlineRequest) -> Deck: ...
    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide: ...

@dataclass
class PlaceholderStrategy(OutlineStrategy):
    def _title_base(self, i: int, req: OutlineRequest, seeds: List[str]) -> str:
        from_doc = bool(seeds)
        topic = (req.topic or (seeds[0] if from_doc else "Untitled")).strip()
        if from_doc:
            return _clip(seeds[i % len(seeds)])
        heading = _DEFAULT_HEADINGS[i % len(_DEFAULT_HEADINGS)]
        return f"{_clip(topic)} — {heading}"

    def _default_sections(self, slide_id: str) -> List[ListSection]:
        return [
            ListSection(
                id=f"{slide_id}-l1",
                bullets=["placeholder bullet"],
                role="primary",
            )
        ]

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        if not (req.topic or req.text):
            raise HTTPException(400, "Provide either 'text' or 'topic'")

        n = max(1, min(req.slide_count, 15))
        seeds = _seed_lines((req.text or "").strip())
        from_doc = bool(seeds)
        topic = (req.topic or (seeds[0] if from_doc else "Untitled")).strip()

        async with aspan("outline_placeholder_generate", slide_count=n, from_doc=from_doc):
            slides: List[Slide] = []
            for i in range(n):
                s_id = uuid.uuid4().hex
                base = self._title_base(i, req, seeds)
                slides.append(
                    Slide(
                        id=s_id,
                        title=f"Slide {i+1}: {base}",
                        meta=Meta(sections=self._default_sections(s_id)),
                        notes=None,
                        layout="title_bullets_left",
                        media=[],
                    )
                )
            return Deck(
                version=SCHEMA_VERSION,
                topic=topic,
                source=None,
                slide_count=len(slides),
                created_at=datetime.utcnow(),
                slides=slides,
            )

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        n = max(1, min(req.slide_count, 15))
        if index < 0 or index >= n:
            raise HTTPException(400, f"index {index} out of range for slide_count={n}")
        seeds = _seed_lines((req.text or "").strip())
        async with aspan("outline_placeholder_regenerate", index=index):
            s_id = uuid.uuid4().hex
            base = self._title_base(index, req, seeds)
            return Slide(
                id=s_id,
                title=f"Slide {index+1}: {base}",
                meta=Meta(sections=self._default_sections(s_id)),
                notes=None,
                layout="title_bullets_left",
                media=[],
            )

# ---------- agent helpers ----------
def _agent_outline_to_deck(agent_obj: Any, req: OutlineRequest) -> Deck:
    """
    Convert agent outline like:
      {
        "slide 1": {"text": {"title": "Problem & Motivation", "bullets": ["point","point"]}},
        "slide 2": {"text": {"title": "Method", "bullets": ["point","point"]}}
      }
    into our Deck/Slide schema.
    """
    # Accept a JSON string or a dict
    if isinstance(agent_obj, str):
        try:
            agent_obj = json.loads(agent_obj)
        except Exception as e:
            raise HTTPException(502, f"Agent returned non-JSON string: {e}")

    if not isinstance(agent_obj, dict):
        raise HTTPException(502, "Agent outline is not a JSON object")

    # Sort slides numerically if possible
    def _key(k: str) -> int:
        try:
            return int(re.sub(r"[^\d]+", "", k) or "0")
        except Exception:
            return 0

    slides: List[Slide] = []
    for idx, key in enumerate(sorted(agent_obj.keys(), key=_key)):
        node = agent_obj.get(key) or {}
        text = (node.get("text") or {})
        title = (text.get("title") or f"Slide {idx+1}").strip()

        bullets = text.get("bullets") or []
        if not isinstance(bullets, list):
            bullets = [str(bullets)]

        slide_id = uuid.uuid4().hex
        sections = [
            ListSection(
                id=f"{slide_id}-l1",
                bullets=[str(b).strip() for b in bullets if str(b).strip()],
                role="primary",
            )
        ]

        slides.append(
            Slide(
                id=slide_id,
                title=title,
                meta=Meta(sections=sections),
                notes=None,
                layout="title_bullets_left",
                media=[],
            )
        )

    topic = req.topic or "Presentation"
    return Deck(
        version=SCHEMA_VERSION,
        topic=topic,
        source=None,
        slide_count=len(slides),
        created_at=datetime.utcnow(),
        slides=slides,
    )

def _build_agent_payload(req: OutlineRequest, parsed_json: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    What we send to the agent. We prefer the parsed.json content (now including slides_target)
    but we also include topic/text for convenience/backwards-compat.
    """
    payload: Dict[str, Any] = {
        "topic": req.topic,
        "slide_count": req.slide_count,
        "text": req.text,  # keep for agents that still expect raw text
    }
    if parsed_json is not None:
        payload["parsed"] = parsed_json
    else:
        # minimal parsed shape for agents that expect it
        payload["parsed"] = {
            "input": {
                "text": (req.text or ""),
                "slides_target": req.slide_count,
            }
        }
    return payload

# ---------- agent strategy ----------
@dataclass
class AgentStrategy(OutlineStrategy):
    url: str
    timeout_ms: int = settings.AGENT_TIMEOUT_MS

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        # Try to enrich parsed.json on disk with slides_target (if we know upload_id)
        upload_id: Optional[str] = getattr(req, "upload_id", None)
        parsed_json = _ensure_slides_target_on_disk(upload_id, req.slide_count, req.topic)

        payload = _build_agent_payload(req, parsed_json)

        async with httpx.AsyncClient(timeout=self.timeout_ms / 1000) as client:
            async with aspan("agent_outline_request", url=self.url, path="/outline", timeout_ms=self.timeout_ms):
                r = await client.post(self.url.rstrip("/") + "/outline", json=payload)
            with span("agent_outline_response", status=r.status_code, bytes=len(r.content)):
                ...
            r.raise_for_status()
            # The agent might return a JSON object or a JSON-string-encoded outline
            data = r.json()

        # Accept either {"slide 1": {...}} or {"outline": {...}}
        outline_obj = data.get("outline") if isinstance(data, dict) and "outline" in data else data
        deck = _agent_outline_to_deck(outline_obj, req)
        return deck

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        # Optional: support regen via agent, but convert a single-slide response to our schema.
        upload_id: Optional[str] = getattr(req, "upload_id", None)
        parsed_json = _ensure_slides_target_on_disk(upload_id, req.slide_count, req.topic)
        payload = _build_agent_payload(req, parsed_json)
        payload["index"] = index

        async with httpx.AsyncClient(timeout=self.timeout_ms / 1000) as client:
            async with aspan(
                "agent_regen_request", url=self.url, path=f"/outline/{index}/regenerate",
                index=index, timeout_ms=self.timeout_ms
            ):
                r = await client.post(self.url.rstrip("/") + f"/outline/{index}/regenerate", json=payload)
            with span("agent_regen_response", status=r.status_code, bytes=len(r.content), index=index):
                ...
            r.raise_for_status()
            data = r.json()

        # Expect either a one-slide outline or a direct slide description
        # Normalize to the same structure then reuse the converter
        if isinstance(data, dict) and "outline" in data:
            outline_obj = data["outline"]
        else:
            outline_obj = data

        # Force it to look like {"slide 1": {...}} for the converter
        if not isinstance(outline_obj, dict) or any(k for k in outline_obj.keys() if not str(k).lower().startswith("slide")):
            outline_obj = {f"slide {index+1}": outline_obj}

        deck = _agent_outline_to_deck(outline_obj, req)
        # Return just the requested slide
        return deck.slides[0] if deck.slides else Slide(
            id=uuid.uuid4().hex,
            title=f"Slide {index+1}",
            meta=Meta(sections=[ListSection(id="auto", bullets=["(empty)"], role="primary")]),
            notes=None,
            layout="title_bullets_left",
            media=[],
        )

@dataclass
class OutlineService:
    primary: OutlineStrategy
    fallback: OutlineStrategy
    _img_provider = None  # cached provider instance

    def _provider(self):
        if self._img_provider is None:
            self._img_provider = build_image_provider()  # uses our back-compat shim
        return self._img_provider

    async def _enrich_images(self, deck: Deck) -> Deck:
        """
        Attach a deterministic image to each slide that lacks media.
        Controlled by settings.FEATURE_IMAGE_API.
        """
        if not settings.FEATURE_IMAGE_API:
            return deck

        provider = self._provider()
        provider_name = provider.__class__.__name__
        async with aspan("image_enrich_deck", slides=len(deck.slides), provider=provider_name):
            for idx, s in enumerate(deck.slides):
                if getattr(s, "media", None) and len(s.media) > 0:
                    continue  # already has media
                kw = _kw_from_title(s.title, deck.topic)
                async with aspan("image_enrich_slide", idx=idx, kw=kw):
                    try:
                        media = await provider.image_for(kw, idx)
                        if media:
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
        """Primary strategy → fallback on error → optional image enrichment."""
        try:
            async with aspan("outline_generate", strategy=self.primary.__class__.__name__):
                deck = await self.primary.generate_deck(req)
        except Exception:
            log.warning("outline primary failed; using fallback", exc_info=True)
            async with aspan("outline_generate_fallback", strategy=self.fallback.__class__.__name__):
                deck = await self.fallback.generate_deck(req)

        deck = await self._enrich_images(deck)
        return deck

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        """Regenerate one slide with fallback + optional image enrichment."""
        try:
            async with aspan("outline_regenerate", strategy=self.primary.__class__.__name__, index=index):
                slide = await self.primary.regenerate_slide(index, req)
        except Exception:
            log.warning("outline regen primary failed; using fallback", exc_info=True)
            async with aspan("outline_regenerate_fallback", strategy=self.fallback.__class__.__name__, index=index):
                slide = await self.fallback.regenerate_slide(index, req)

        if settings.FEATURE_IMAGE_API:
            provider = self._provider()
            kw = _kw_from_title(slide.title, req.topic)
            async with aspan("image_enrich_slide", idx=index, kw=kw):
                try:
                    media = await provider.image_for(kw, index)
                    if media:
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
    """
    Toggle agent/placeholder via settings:
      settings.FEATURE_USE_MODEL (bool) and settings.AGENT_URL (str)
    """
    if settings.FEATURE_USE_MODEL and settings.AGENT_URL:
        return OutlineService(
            primary=AgentStrategy(url=settings.AGENT_URL, timeout_ms=settings.AGENT_TIMEOUT_MS),
            fallback=PlaceholderStrategy(),
        )
    return OutlineService(primary=PlaceholderStrategy(), fallback=PlaceholderStrategy())
