from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.auth import require_token
from app.core.config import settings
from app.models.schemas.layouts import (
    LayoutLibrary,
    LayoutItem,
    LayoutFilterRequest,
    Frame,
)

router = APIRouter(
    tags=["layouts"],
    dependencies=([Depends(require_token)] if settings.AUTH_ENABLED else []),
)

# ---------- Defaults (fallback if JSON missing/invalid) ----------
DEFAULT_LIB = LayoutLibrary(
    items=[
        LayoutItem(
            id="title_bullets_left",
            name="Title + Bullets (Left)",
            supports={"text_min": 1, "text_max": 12, "images_min": 0, "images_max": 1},
            weight=0.95,
            preview_url="/static/layouts/title_bullets_left.png",
            frames={
                "title":   Frame(x=80, y=64,  w=1120, h=80).model_dump(),
                "bullets": [Frame(x=80, y=170, w=720,  h=360).model_dump()],
                "images":  [Frame(x=840, y=200, w=360,  h=240).model_dump()],
            },
            style={"title": {"font": "Inter", "size": 36, "weight": 700}},
        ),
        LayoutItem(
            id="title_image_right",
            name="Title + Image (Right)",
            supports={"text_min": 0, "text_max": 6, "images_min": 1, "images_max": 1},
            weight=0.90,
            preview_url="/static/layouts/title_image_right.png",
            frames={
                "title":  Frame(x=80, y=64,  w=720,  h=80).model_dump(),
                "images": [Frame(x=840, y=140, w=360,  h=360).model_dump()],
            },
            style={"title": {"font": "Inter", "size": 36, "weight": 700}},
        ),
        LayoutItem(
            id="two_col_text_image",
            name="Two Columns (Text + Image)",
            supports={"text_min": 1, "text_max": 10, "images_min": 1, "images_max": 2},
            weight=0.85,
            preview_url="/static/layouts/two_col_text_image.png",
            frames={
                "title":   Frame(x=80, y=64,  w=1120, h=80).model_dump(),
                "bullets": [Frame(x=80, y=170, w=540,  h=360).model_dump()],
                "images":  [Frame(x=660, y=170, w=540,  h=360).model_dump()],
            },
            style={"title": {"font": "Inter", "size": 36, "weight": 700}},
        ),
    ],
    total=3,
)

# ---------- Load from JSON and normalize ----------
LAYOUTS_JSON = Path("app/static/layouts/layouts.json").resolve()
_LIB: LayoutLibrary = DEFAULT_LIB  # in-memory cache
_LAYOUTS_MTIME: float | None = None  # for auto-reload


def _as_list(v: Any) -> list[Any]:
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def _normalize_item(d: dict) -> dict:
    # supports: accept {text_min/max, images_min/max} or {text_count, image_count}
    sup = dict(d.get("supports") or {})
    if "text_count" in sup and ("text_min" not in sup and "text_max" not in sup):
        c = int(sup.get("text_count", 0))
        sup["text_min"], sup["text_max"] = 0, c
    if "image_count" in sup and ("images_min" not in sup and "images_max" not in sup):
        c = int(sup.get("image_count", 0))
        sup["images_min"], sup["images_max"] = 0, c
    d["supports"] = sup

    # frames: allow img0/img1… or single bullets dict; convert to canonical
    frames = dict(d.get("frames") or {})
    if any(k.startswith("img") for k in frames):
        imgs = []
        for k in list(frames.keys()):
            if k.startswith("img"):
                imgs.append(frames.pop(k))
        frames["images"] = _as_list(frames.get("images")) + imgs
    b = frames.get("bullets")
    if b and not isinstance(b, list):
        frames["bullets"] = [b]
    d["frames"] = frames
    return d


def _load_from_json() -> tuple[LayoutLibrary, float | None]:
    if not LAYOUTS_JSON.exists():
        return DEFAULT_LIB, None
    try:
        raw = json.loads(LAYOUTS_JSON.read_text(encoding="utf-8"))
        items = [_normalize_item(dict(x)) for x in (raw.get("items") or [])]
        lib = LayoutLibrary(
            items=[LayoutItem(**it) for it in items],
            page=int(raw.get("page") or 1),
            page_size=int(raw.get("page_size") or max(1, len(items))),
            total=int(raw.get("total") or len(items)),
        )
        mtime = LAYOUTS_JSON.stat().st_mtime
        return lib, mtime
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").warning(f"layouts.json load failed: {e}")
        return DEFAULT_LIB, None


# Load once at import
_LIB, _LAYOUTS_MTIME = _load_from_json()


# -------- Option B: getter the editor can import --------
def get_layout_library(reload: bool = False) -> LayoutLibrary:
    """
    Return the current in-memory layout library.
    If reload=True, re-read layouts.json.
    Also auto-reloads if the file's mtime changed.
    """
    global _LIB, _LAYOUTS_MTIME
    if reload:
        _LIB, _LAYOUTS_MTIME = _load_from_json()
        return _LIB

    # Auto-reload on file change (dev convenience)
    try:
        mtime = LAYOUTS_JSON.stat().st_mtime
    except FileNotFoundError:
        mtime = None
    if mtime != _LAYOUTS_MTIME:
        _LIB, _LAYOUTS_MTIME = _load_from_json()
    return _LIB


# ------------------------------- Scoring -------------------------------
def _penalty(value: int, mn: int | None, mx: int | None) -> float:
    if mn is not None and value < mn:
        return float(mn - value) * 2.0
    if mx is not None and value > mx:
        return float(value - mx) * 1.5
    return 0.0


def _closeness(value: int, mn: int | None, mx: int | None) -> float:
    if mn is None or mx is None or mx <= mn:
        return 0.0
    center = (mn + mx) / 2.0
    span = (mx - mn)
    return abs(value - center) / max(1.0, span)


def _score_layout(item: LayoutItem, text_count: int, image_count: int) -> float:
    sup = item.supports or {}
    tmin, tmax = sup.get("text_min"), sup.get("text_max")
    imin, imax = sup.get("images_min"), sup.get("images_max")
    p = _penalty(text_count, tmin, tmax) + _penalty(image_count, imin, imax)
    if p == 0.0:
        p += (_closeness(text_count, tmin, tmax) + _closeness(image_count, imin, imax)) * 0.5
    w = float(getattr(item, "weight", 1.0) or 1.0)
    return p / max(0.1, w)


# ------------------------------- Routes -------------------------------
@router.get("/layouts", response_model=LayoutLibrary)
def list_layouts(reload: bool = Query(False, description="Reload layouts.json from disk")) -> LayoutLibrary:
    return get_layout_library(reload=reload)


@router.post("/layouts/filter")
def filter_layouts(req: LayoutFilterRequest):
    lib = get_layout_library()
    comps = req.components or {}
    text_count = int(comps.get("text_count", 0) or 0)
    image_count = int(comps.get("image_count", 0) or 0)
    scored = sorted(lib.items, key=lambda li: _score_layout(li, text_count, image_count))
    topk = max(1, min(getattr(req, "top_k", 1) or 1, 50))
    return {"candidates": [li.id for li in scored[:topk]]}
