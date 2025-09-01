from __future__ import annotations

import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, Header, Depends, HTTPException
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel

from app.core.auth import require_token
from app.core.config import settings
from app.core.telemetry import aspan, span
from app.models.schemas.slide import Deck
from app.models.schemas.editor import EditorDoc, EditorSlide, EditorLayer
from app.api.v1.endpoints.layouts import get_layout_library

router = APIRouter(
    tags=["editor"],
    dependencies=([Depends(require_token)] if settings.AUTH_ENABLED else []),
)

THEME_PRESETS = {
    "default": {
        "colors": {
            "surface": "#ffffff",
            "text": "#111827",      # slate-900-ish
            "mutedText": "#475569", # slate-600-ish
        }
    },
    "dark": {
        "colors": {
            "surface": "#0f172a",   # slate-900/blue-900
            "text": "#e2e8f0",      # slate-200
            "mutedText": "#94a3b8", # slate-400
        }
    },
}

# Lightweight idempotency cache for dev
_IDEMP_CACHE: dict[str, tuple[float, dict]] = {}
_IDEMP_TTL_SEC = 300  # 5 minutes


class Selection(BaseModel):
    slide_id: str
    layout_id: Optional[str] = None


class BuildRequest(BaseModel):
    deck: Deck
    selections: List[Selection]
    theme: str = "default"
    page: dict = {"width": 1280, "height": 720, "unit": "px"}
    policy: str = "best_fit"  # or "strict"
    warnings_as_errors: bool = False


@router.post("/editor/build")
async def build_editor_doc(
    payload: BuildRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    now = time.time()

    # Cache HIT fast-path
    if idempotency_key and idempotency_key in _IDEMP_CACHE:
        ts, resp = _IDEMP_CACHE[idempotency_key]
        if now - ts < _IDEMP_TTL_SEC:
            out = dict(resp)  # shallow copy
            out.setdefault("meta", {})["idempotency"] = "HIT"
            return JSONResponse(content=jsonable_encoder(out))

    warnings: list[dict] = []
    slides_out: List[EditorSlide] = []

    async with aspan("editor_build", policy=payload.policy, theme=payload.theme):
        deck = payload.deck
        layout_by_slide = {sel.slide_id: sel.layout_id for sel in payload.selections}

        lib = get_layout_library()

        # pick theme tokens
        T = THEME_PRESETS.get(payload.theme, THEME_PRESETS["default"])
        surface = T["colors"]["surface"]
        text = T["colors"]["text"]
        muted = T["colors"]["mutedText"]

        for s in deck.slides:
            with span("layout_apply_slide", slide_id=s.id):
                layout_id = layout_by_slide.get(s.id) or "title_bullets_left"
                layout = next((li for li in lib.items if li.id == layout_id), None)

                if not layout and payload.policy == "best_fit":
                    layout = max(lib.items, key=lambda li: li.weight)
                    warnings.append({
                        "slide_id": s.id,
                        "reason": "unknown_layout_best_fit_substitution",
                        "layout_id": layout.id,
                    })
                elif not layout and payload.policy == "strict":
                    raise HTTPException(status_code=400, detail=f"Unknown layout_id {layout_id} for slide {s.id}")

                layers: List[EditorLayer] = []

                # Title
                if layout.frames.get("title"):
                    layers.append(EditorLayer(
                        id=f"ly_{s.id}_title",
                        kind="textbox",
                        frame=layout.frames["title"],
                        text=s.title,
                        style={"font": "Inter", "size": 36, "weight": 700, "align": "left", "color": text},
                        z=10,
                    ))

                # Bullets
                if layout.frames.get("bullets") and s.bullets:
                    bf0 = (layout.frames.get("bullets") or [None])[0]
                    if bf0:
                        layers.append(EditorLayer(
                            id=f"ly_{s.id}_bullets",
                            kind="textbox",
                            frame=bf0,
                            text="\n".join([f"- {b}" for b in s.bullets]),
                            style={"font": "Inter", "size": 20, "color": muted},
                            z=9,
                        ))

                # First image(s)
                if layout.frames.get("images") and s.media:
                    frames = list(layout.frames["images"] or [])
                    imgs = []
                    for m in (s.media or []):
                        if isinstance(m, dict):
                            u = m.get("url")
                            if u: imgs.append({"url": u, "source": m.get("source"), "asset_id": m.get("asset_id")})
                        else:
                            u = getattr(m, "url", None)
                            if u: imgs.append({"url": u, "source": getattr(m, "source", None), "asset_id": getattr(m, "asset_id", None)})

                    for j, (m, fr) in enumerate(zip(imgs, frames)):
                        layers.append(EditorLayer(
                            id=f"ly_{s.id}_img{j}",
                            kind="image",
                            frame=fr,
                            source={"type": m.get("source") or "external", "asset_id": m.get("asset_id"), "url": m["url"]},
                            fit="cover",
                            z=6,
                        ))

                # Compose slide with theme surface background
                slides_out.append(EditorSlide(
                    id=s.id,
                    name=s.title,
                    background={"fill": surface},
                    layers=layers,
                    meta={"layout_id": layout.id},
                ))

        # Page + theme meta
        page = {**payload.page, "background": {"fill": surface}}

        editor = EditorDoc(
            editor_id=f"ed_{uuid.uuid4().hex[:12]}",
            deck_id=f"dk_{uuid.uuid4().hex[:8]}",
            page=page,
            theme=payload.theme,
            slides=slides_out,
            meta={"created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")},
            theme_meta=T,  # optional; your UI can read this
        )

    resp = {"editor": editor, "warnings": warnings}

    # Cache MISS: remember response for future HIT
    if idempotency_key:
        _IDEMP_CACHE[idempotency_key] = (now, resp)

    # Explicit, safe JSON encoding
    return JSONResponse(content=jsonable_encoder(resp))
