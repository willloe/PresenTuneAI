# app/services/image_service.py
from __future__ import annotations
import os, hashlib, logging, httpx
from dataclasses import dataclass
from functools import lru_cache
from typing import Optional

from app.models.schemas.slide import Media

log = logging.getLogger("image")

def _seed(text: str, index: int) -> str:
    h = hashlib.sha1(f"{text}|{index}".encode("utf-8")).hexdigest()[:16]
    return h

def _clip(s: str | None, n: int = 160) -> str | None:
    if not s: 
        return None
    s = s.strip()
    return s if len(s) <= n else (s[: n - 1].rstrip() + "…")

class ImageProvider:
    async def image_for(self, keyword: str, index: int, w: int = 800, h: int = 500) -> Optional[Media]:
        ...

@dataclass
class StubImageProvider(ImageProvider):
    def _url(self, keyword: str, index: int, w: int, h: int) -> str:
        seed = _seed(keyword, index)
        return f"https://picsum.photos/seed/{seed}/{w}/{h}"

    async def image_for(self, keyword: str, index: int, w: int = 800, h: int = 500) -> Optional[Media]:
        url = self._url(keyword, index, w, h)
        log.info("image_stub", extra={"kw": keyword, "idx": index, "url": url})
        return Media(type="image", url=url, alt=_clip(keyword))

@dataclass
class PexelsImageProvider(ImageProvider):
    api_key: str
    timeout_s: float = 8.0  # env-tuned

    async def image_for(self, keyword: str, index: int, w: int = 800, h: int = 500) -> Optional[Media]:
        # deterministic page variation by index; prefer landscape results
        headers = {"Authorization": self.api_key}
        params = {
            "query": keyword or "abstract",
            "per_page": 1,
            "page": (index % 10) + 1,
            "orientation": "landscape",
            "size": "large",
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                r = await client.get("https://api.pexels.com/v1/search", headers=headers, params=params)
                r.raise_for_status()
                js = r.json()
        except httpx.HTTPError as e:
            log.warning("pexels_http_error", extra={"kw": keyword, "idx": index, "err": type(e).__name__})
            return None

        photos = js.get("photos") or []
        if not photos:
            log.info("pexels_no_results", extra={"kw": keyword, "idx": index})
            return None

        src = photos[0].get("src", {})
        url = src.get("landscape") or src.get("large") or src.get("original")
        if not url:
            log.info("pexels_no_url_in_src", extra={"kw": keyword, "idx": index})
            return None
        return Media(type="image", url=url, alt=_clip(keyword))

@lru_cache(maxsize=1)
def build_image_provider() -> ImageProvider:
    provider = os.getenv("IMAGE_PROVIDER", "stub").lower()
    timeout_ms = int(os.getenv("AGENT_TIMEOUT_MS", "8000"))
    if provider == "pexels" and os.getenv("PEXELS_API_KEY"):
        return PexelsImageProvider(api_key=os.getenv("PEXELS_API_KEY"), timeout_s=timeout_ms / 1000)
    return StubImageProvider()
