from __future__ import annotations

import time
import uuid
from typing import List, Optional

from fastapi import APIRouter, Header, Depends
from pydantic import BaseModel

from app.core.auth import require_token
from app.core.config import settings
from app.core.telemetry import aspan, span
from app.models.schemas.slide import Deck
from app.models.schemas.editor import EditorDoc, EditorSlide, EditorLayer
from app.api.v1.endpoints.layouts import LIB  # reuse in-memory library

router = APIRouter(
    tags=["editor"],
    dependencies=([Depends(require_token)] if settings.AUTH_ENABLED else []),
)

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
    if idempotency_key and idempotency_key in _IDEMP_CACHE:
        ts, resp = _IDEMP_CACHE[idempotency_key]
        if now - ts < _IDEMP_TTL_SEC:
            # tiny marker so you can tell it's a cache hit in DevTools
            resp = dict(resp)
            resp.setdefault("meta", {})["idempotency"] = "HIT"
            return resp

    with aspan("editor_build", policy=payload.policy, theme=payload.theme):
        deck = payload.deck
        layout_by_slide = {sel.slide_id: sel.layout_id for sel in payload.selections}
        warnings: list[dict] = []
        slides_out: List[EditorSlide] = []

        for s in deck.slides:
            with span("layout_apply_slide", slide_id=s.id):
                layout_id = layout_by_slide.get(s.id) or "title_bullets_left"
                layout = next((li for li in LIB.items if li.id == layout_id), None)

                if not layout and payload.policy == "best_fit":
                    layout = max(LIB.items, key=lambda li: li.weight)
                    warnings.append({
                        "slide_id": s.id,
                        "reason": "unknown_layout_best_fit_substitution",
                        "layout_id": layout.id,
                    })
                elif not layout and payload.policy == "strict":
                    return {"detail": f"Unknown layout_id {layout_id} for slide {s.id}"}, 400

                layers: List[EditorLayer] = []

                # Title
                if "title" in layout.frames:
                    layers.append(
                        EditorLayer(
                            id=f"ly_{s.id}_title",
                            kind="textbox",
                            frame=layout.frames["title"],
                            text=s.title,
                            style={"font": "Inter", "size": 36, "weight": 700, "align": "left"},
                            z=10,
                        )
                    )

                # Bullets
                if "bullets" in layout.frames and s.bullets:
                    layers.append(
                        EditorLayer(
                            id=f"ly_{s.id}_bullets",
                            kind="textbox",
                            frame=layout.frames["bullets"][0],
                            text="\n".join([f"- {b}" for b in s.bullets]),
                            style={"font": "Inter", "size": 20},
                            z=9,
                        )
                    )

                # First image (if any)
                if "images" in layout.frames and s.media:
                    m0 = s.media[0]
                    layers.append(
                        EditorLayer(
                            id=f"ly_{s.id}_img0",
                            kind="image",
                            frame=layout.frames["images"][0],
                            source={"type": ge
