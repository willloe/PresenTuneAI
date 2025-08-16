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
from app.api.v1.endpoints.layouts import get_layout_library  # ⬅️ Option B: import the getter

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

        # ⬇️ Option B: fetch the current in-memory library at request time
        lib = get_layout_library()

        for s in deck.slides:
            with span("layout_apply_slide", slide_id=s.id):
                layout_id = layout_by_slide.get(s.id) or "title_bullets_left"
                layout = next((li for li in lib.items if li.id == layout_id), None)

                if not layout and payload.policy == "best_fit":
                    layout = max(lib.items, key=lambda li: li.weight)
                    warnings.append(
                        {
                            "slide_id": s.id,
                            "reason": "unknown_layout_best_fit_substitution",
                            "layout_id": layout.id,
                        }
                    )
                elif not layout and payload.policy == "strict":
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unknown layout_id {layout_id} for slide {s.id}",
                    )

                layers: List[EditorLayer] = []

                # Title
                if "title" in layout.frames and layout.frames["title"]:
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
                    bullet_frames = layout.frames.get("bullets") or []
                    bf0 = bullet_frames[0] if isinstance(bullet_frames, list) and bullet_frames else None
                    if bf0:
                        layers.append(
                            EditorLayer(
                                id=f"ly_{s.id}_bullets",
                                kind="textbox",
                                frame=bf0,
                                text="\n".join([f"- {b}" for b in s.bullets]),
                                style={"font": "Inter", "size": 20},
                                z=9,
                            )
                        )

                # First image (if any)
                if "images" in layout.frames and s.media:
                    image_frames = layout.frames.get("images") or []
                    imf0 = image_frames[0] if isinstance(image_frames, list) and image_frames else None
                    if imf0:
                        m0 = s.media[0]
                        if isinstance(m0, dict):
                            url = m0.get("url")
                            source = m0.get("source")
                            asset_id = m0.get("asset_id")
                        else:
                            url = getattr(m0, "url", None)
                            source = getattr(m0, "source", None)
                            asset_id = getattr(m0, "asset_id", None)

                        layers.append(
                            EditorLayer(
                                id=f"ly_{s.id}_img0",
                                kind="image",
                                frame=imf0,
                                source={"type": source or "external", "asset_id": asset_id, "url": url},
                                fit="cover",
                                z=6,
                            )
                        )

                # Append the composed slide
                slides_out.append(
                    EditorSlide(id=s.id, name=s.title, layers=layers, meta={"layout_id": layout.id})
                )

        # Compose the full EditorDoc
        editor = EditorDoc(
            editor_id=f"ed_{uuid.uuid4().hex[:12]}",
            deck_id=f"dk_{uuid.uuid4().hex[:8]}",
            page=payload.page,
            theme=payload.theme,
            slides=slides_out,
            meta={"created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")},
        )

    resp = {"editor": editor, "warnings": warnings}

    # Cache MISS: remember response for future HIT
    if idempotency_key:
        _IDEMP_CACHE[idempotency_key] = (now, resp)

    # Explicit, safe JSON encoding
    return JSONResponse(content=jsonable_encoder(resp))
