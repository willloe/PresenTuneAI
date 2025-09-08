from __future__ import annotations

import asyncio
import time, re
from typing import Optional

from fastapi import APIRouter, Header, Depends, HTTPException

from app.core.auth import require_token
from app.core.config import settings
from app.core.telemetry import aspan, span
from app.models.schemas.image_gen import ImageGenRequest, ImageGenResponse, ImageAsset
from app.services.image_service import build_image_generator  # factory (shim)

router = APIRouter(
    prefix="/images",
    tags=["images"],
    dependencies=([Depends(require_token)] if settings.AUTH_ENABLED else []),
)

_IDEMP: dict[str, tuple[float, ImageGenResponse]] = {}
_IDEMP_TTL = 300.0

_STOPWORDS = {"a","an","the","and","or","for","to","of","with","in","on","at","by","about","from","into"}

def _style_hint(style: str | None) -> str:
    s = (style or "").strip().lower()
    if s.startswith("photo"):         return "cinematic photo, natural lighting, shallow depth of field, centered composition"
    if s.startswith("illustration"):  return "flat vector illustration, clean shapes, soft gradients"
    if s.startswith("diagram"):       return "clean diagram on white background, thin lines, labeled arrows"
    if s.startswith("icon"):          return "minimal monochrome icon, flat vector, centered"
    return ""

def _b64_from_data_url(data_url: Optional[str]) -> Optional[str]:
    if not data_url: return None
    return data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url

def _validate_size(sz: Optional[str]) -> str:
    allow = {"1024x1024","1024x768","768x1024","512x512"}
    if not sz: return "1024x1024"
    if sz not in allow:
        raise HTTPException(400, f"Unsupported size '{sz}'. Allowed: {', '.join(sorted(allow))}")
    return sz

def _validate_n(n: Optional[int]) -> int:
    try:
        val = int(n or 1)
    except Exception:
        raise HTTPException(400, "n must be an integer")
    if not (1 <= val <= 8):
        raise HTTPException(400, "n must be between 1 and 8")
    return val

def _keywords_for_stock_search(text: str) -> str:
    # ultra-light keywordizer: alnum tokens, drop stopwords, take first 5
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    keep = [w for w in words if w not in _STOPWORDS]
    return ", ".join(keep[:5]) or "abstract"

@router.post("/generate", response_model=ImageGenResponse)
async def generate_images(
    body: ImageGenRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    # Idempotency
    now = time.monotonic()
    if idempotency_key and idempotency_key in _IDEMP:
        ts, cached = _IDEMP[idempotency_key]
        if (now - ts) < _IDEMP_TTL:
            with span("image_idempotency_hit", key=idempotency_key):
                return cached

    prompt = (body.prompt or "").strip()
    if not prompt:
        raise HTTPException(400, "prompt is required")

    size = _validate_size(body.size)
    n = _validate_n(body.n)
    ref_b64 = _b64_from_data_url(body.reference_image)
    mask_b64 = _b64_from_data_url(body.mask)

    # Light style enrichment
    hint = _style_hint(body.style)
    enriched_prompt = f"{prompt}\n\nStyle: {hint}. Keep margins; high contrast." if hint else prompt

    # If the configured provider is pexels, compact to a keyword query
    using_provider = (settings.IMAGE_PROVIDER or "stub").lower()
    used_query: Optional[str] = None
    provider_prompt = enriched_prompt
    if using_provider == "pexels":
        used_query = _keywords_for_stock_search(prompt)  # use raw prompt, not style
        provider_prompt = used_query

    provider = build_image_generator()
    if provider is None:
        raise HTTPException(501, "Image generation provider not configured")

    # Call provider
    async with aspan("image_generate", provider=using_provider, size=size, n=n):
        try:
            maybe_coro = provider.generate(
                prompt=provider_prompt,
                n=n,
                size=size,
                reference_b64=ref_b64,
                mask_b64=mask_b64,
            )
            urls = await maybe_coro if asyncio.iscoroutine(maybe_coro) else maybe_coro
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(502, f"Image generation failed: {type(e).__name__}: {e}") from e

    if not urls:
        raise HTTPException(502, "Provider returned no images")

    resp = ImageGenResponse(
        assets=[ImageAsset(url=u) for u in urls],
        provider=using_provider,
        model=(settings.IMAGE_OPENAI_MODEL if using_provider in {"openai","gpt","gpt-image"} else None),
        used_query=used_query,
    )
    if idempotency_key:
        _IDEMP[idempotency_key] = (now, resp)
    return resp
