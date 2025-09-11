from __future__ import annotations

import os, hashlib, logging, httpx, asyncio
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional, List

from app.core.config import settings
from app.models.schemas.slide import Media

log = logging.getLogger("image")

# ─────────────────────────── Helpers ───────────────────────────

def _seed(text: str, index: int) -> str:
    return hashlib.sha1(f"{text}|{index}".encode("utf-8")).hexdigest()[:16]

def _clip(s: str | None, n: int = 160) -> str | None:
    if not s:
        return None
    s = s.strip()
    return s if len(s) <= n else (s[: n - 1].rstrip() + "…")

def _parse_size(size: str | None, fallback: str = "1024x1024") -> tuple[int, int]:
    s = (size or fallback).lower().strip()
    try:
        w, h = s.split("x")
        return max(1, int(w)), max(1, int(h))
    except Exception:
        return (1024, 1024)

def _style_hint(style: str | None) -> str:
    s = (style or "").lower()
    if s.startswith("photo"):
        return "cinematic photo, natural lighting, shallow depth of field"
    if s.startswith("illustration"):
        return "flat vector illustration, clean shapes, soft gradients"
    if s.startswith("diagram"):
        return "clean diagram on white background, thin lines, labeled arrows"
    if s.startswith("icon"):
        return "minimal monochrome icon, flat vector, centered"
    return ""

# ─────────────────────────── New interface (generator) ─────────────────────────

class ImageGenerator:
    """Provider-agnostic generator: returns a list of image URLs (can be data: URLs)."""
    async def generate(
        self,
        prompt: str,
        n: int = 1,
        size: str = "1024x1024",
        reference_b64: Optional[str] = None,
        mask_b64: Optional[str] = None,
        **kwargs,
    ) -> List[str]:
        raise NotImplementedError

# ----------------------------- Stub (picsum) -----------------------------

@dataclass
class StubImageGenerator(ImageGenerator):
    """Deterministic placeholder images via picsum.photos"""
    async def generate(self, prompt: str, n: int = 1, size: str = "1024x1024", **_) -> List[str]:
        w, h = _parse_size(size, "1024x1024")
        out = []
        for i in range(max(1, n)):
            seed = _seed(prompt, i)
            out.append(f"https://picsum.photos/seed/{seed}/{w}/{h}")
        log.info("image_stub", extra={"n": n, "size": size})
        return out

# ----------------------------- Pexels ------------------------------------

@dataclass
class PexelsImageGenerator(ImageGenerator):
    api_key: str
    timeout_s: float = 8.0

    def _aspect_orientation(self, size: str) -> str:
        try:
            w, h = [int(x) for x in size.lower().split("x")]
        except Exception:
            return "landscape"
        if w == h: return "square"
        return "landscape" if w > h else "portrait"

    async def generate(self, prompt: str, n: int = 1, size: str = "1024x1024", **_) -> List[str]:
        headers = {"Authorization": self.api_key}
        params = {
            "query": prompt or "abstract",
            "per_page": max(1, min(10, n)),
            "page": 1,
            "orientation": self._aspect_orientation(size),
            "size": "large",
            "locale": "en-US",
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                r = await client.get("https://api.pexels.com/v1/search", headers=headers, params=params)
                r.raise_for_status()
                js = r.json()
        except httpx.HTTPError as e:
            log.warning("pexels_http_error", extra={"err": type(e).__name__})
            return []

        photos = js.get("photos") or []
        urls: List[str] = []
        for p in photos[:n]:
            src = p.get("src") or {}
            u = src.get("landscape") or src.get("large") or src.get("original")
            if u:
                urls.append(u)
        log.info("pexels_ok", extra={"n": len(urls)})
        return urls

# ----------------------------- OpenAI (gpt-image-1) ----------------------

@dataclass
class OpenAIImageGenerator(ImageGenerator):
    """
    OpenAI Images (gpt-image-1). Returns data: URLs (PNG).
    Controlled by settings.
    """
    api_key: str
    model: str = settings.IMAGE_OPENAI_MODEL
    style: Optional[str] = settings.IMAGE_OPENAI_STYLE

    def _pick_size(self, requested: str) -> str:
        # Keep to a conservative, broadly-available set.
        allow = {"1024x1024", "1024x768", "768x1024", "512x512"}
        return requested if requested in allow else "1024x1024"

    async def generate(
        self,
        prompt: str,
        n: int = 1,
        size: str = "1024x1024",
        reference_b64: Optional[str] = None,
        mask_b64: Optional[str] = None,
        **_,
    ) -> List[str]:
        enriched = prompt.strip()
        hint = _style_hint(self.style)
        if hint:
            enriched = f"{enriched}\n\nStyle: {hint}. Leave margins for overlaid text; high contrast."
        # deterministic-ish nudge for dev sanity
        enriched = f"{enriched}\n\nVariation id: {_seed(prompt, 0)}"
        eff_size = self._pick_size(size)

        def _call_sync() -> List[str]:
            try:
                from openai import OpenAI
            except Exception as e:
                log.warning("openai_sdk_missing", extra={"err": type(e).__name__})
                return []
            client = OpenAI(api_key=self.api_key)
            try:
                if mask_b64 or reference_b64:
                    # edits path (mask or reference) – note: SDK param shape may vary by version
                    resp = client.images.edits(
                        model=self.model,
                        image=reference_b64,
                        mask=mask_b64,
                        prompt=enriched,
                        n=max(1, n),
                        size=eff_size,
                    )
                else:
                    resp = client.images.generate(
                        model=self.model,
                        prompt=enriched,
                        n=max(1, n),
                        size=eff_size,
                    )
                out: List[str] = []
                for d in (resp.data or []):
                    b64 = getattr(d, "b64_json", None)
                    if b64:
                        out.append(f"data:image/png;base64,{b64}")
                return out
            except Exception as e:
                log.warning("openai_image_error", extra={"err": type(e).__name__})
                return []

        urls = await asyncio.to_thread(_call_sync)
        log.info("openai_image_done", extra={"n": len(urls), "size": eff_size})
        return urls

# ─────────────────────────── Factory ───────────────────────────

@lru_cache(maxsize=1)
def build_image_generator() -> ImageGenerator:
    prov = (settings.IMAGE_PROVIDER or "stub").lower()
    timeout_ms = int(getattr(settings, "AGENT_TIMEOUT_MS", 8000))

    if prov == "pexels" and settings.PEXELS_API_KEY:
        return PexelsImageGenerator(api_key=settings.PEXELS_API_KEY, timeout_s=timeout_ms / 1000)

    if prov in {"openai", "gpt", "gpt-image"} and settings.OPENAI_API_KEY:
        return OpenAIImageGenerator(api_key=settings.OPENAI_API_KEY)

    # default safe (free)
    return StubImageGenerator()

# ───────────────── Back-compat shim for legacy imports ────────────────
# Some modules (e.g., outline_service) still import `build_image_provider`
# and expect an object exposing `image_for(keyword, index, w, h) -> Optional[Media]`.
# Provide a thin adapter over the new generator so nothing else breaks.

class _GeneratorProviderAdapter:
    def __init__(self, gen: ImageGenerator):
        self.gen = gen

    async def image_for(self, keyword: str, index: int, w: int = 800, h: int = 500) -> Optional[Media]:
        # Pass through to generator; choose size from requested w×h (generator will clamp if needed)
        size = f"{max(1, int(w))}x{max(1, int(h))}"
        urls = await self.gen.generate(prompt=keyword or "abstract", n=1, size=size)
        if not urls:
            return None
        return Media(type="image", url=urls[0], alt=_clip(keyword))

@lru_cache(maxsize=1)
def build_image_provider():
    """Legacy alias returning an object with `image_for(...)`."""
    return _GeneratorProviderAdapter(build_image_generator())
