from __future__ import annotations
import os, hashlib, logging, httpx
from dataclasses import dataclass
from typing import Optional

from app.models.schemas.slide import Media

log = logging.getLogger("image")

def _seed(text: str, index: int) -> str:
    # Stable seed based on text + index
    h = hashlib.sha1(f"{text}|{index}".encode("utf-8")).hexdigest()[:16]
    return h

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
        return Media(type="image", url=url, alt=keyword[:160] or None)

@dataclass
class PexelsImageProvider(ImageProvider):
    api_key: str

    async def image_for(self, keyword: str, index: int, w: int = 800, h: int = 500) -> Optional[Media]:
        # Minimal prototype; rotate page/start to vary results deterministically
        headers = {"Authorization": self.api_key}
        params = {"query": keyword or "abstract", "per_page": 1, "page": (index % 10) + 1}
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get("https://api.pexels.com/v1/search", headers=headers, params=params)
            r.raise_for_status()
            js = r.json()
            photos = js.get("photos") or []
            if not photos:
                return None
            src = photos[0].get("src", {})
            # pick landscape if available; else original
            url = src.get("landscape") or src.get("large") or src.get("original")
            if not url:
                return None
            return Media(type="image", url=url, alt=keyword[:160] or None)

def build_image_provider() -> ImageProvider:
    # FEATURE_IMAGE_API=false disables enrichment (handled by caller)
    provider = os.getenv("IMAGE_PROVIDER", "stub").lower()
    if provider == "pexels" and os.getenv("PEXELS_API_KEY"):
        return PexelsImageProvider(api_key=os.getenv("PEXELS_API_KEY"))
    return StubImageProvider()
