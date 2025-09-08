from __future__ import annotations

import json
import os
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Query
from app.core.auth import require_token
from app.core.config import settings
from app.models.schemas.layouts import (
    LayoutLibrary,
    LayoutItem,
    LayoutFilterRequest,
    Frame,
)

log = logging.getLogger("layouts")

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
                "sections": [Frame(x=80, y=170, w=720,  h=360).model_dump()],
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
                "sections": [Frame(x=80, y=170, w=540,  h=360).model_dump()],
                "images":  [Frame(x=660, y=170, w=540,  h=360).model_dump()],
            },
            style={"title": {"font": "Inter", "size": 36, "weight": 700}},
        ),
    ],
    total=3,
)

# ---------- Load from JSON and normalize ----------
def _candidate_paths() -> list[Path]:
    env = os.getenv("LAYOUTS_JSON")
    return [
        Path(env).resolve() if env else None,
        Path("app/static/layouts/layouts.json").resolve(),
        Path("app/static/layouts.json").resolve(),
        Path("app/static/layouts/library.json").resolve(),
        Path("data/layouts.json").resolve(),
    ]

def _pick_path() -> Path | None:
    for p in _candidate_paths():
        if p and p.exists():
            return p
    return None

LAYOUTS_JSON: Path | None = _pick_path()
_LIB: LayoutLibrary = DEFAULT_LIB
_LAYOUTS_MTIME: float | None = None


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

    # frames: allow img0/img1… or legacy bullets -> sections
    frames = dict(d.get("frames") or {})
    if any(k.startswith("img") for k in frames):
        imgs = []
        for k in list(frames.keys()):
            if k.startswith("img"):
                imgs.append(frames.pop(k))
        frames["images"] = _as_list(frames.get("images")) + imgs

    if "sections" not in frames and "bullets" in frames:
        frames["sections"] = _as_list(frames.pop("bullets"))

    for k in ("sections", "bullets", "images"):
        v = frames.get(k)
        if v and not isinstance(v, list):
            frames[k] = [v]

    d["frames"] = frames
    return d


def _load_from_json() -> tuple[LayoutLibrary, float | None]:
    global LAYOUTS_JSON
    path = LAYOUTS_JSON or _pick_path()
    if not path:
        log.warning("layouts_json_missing; using DEFAULT_LIB")
        return DEFAULT_LIB, None
    try:
        raw_text = path.read_text(encoding="utf-8")
        raw = json.loads(raw_text)

        # support either {"items":[...]} or a raw array [...]
        items_raw = raw.get("items") if isinstance(raw, dict) else raw
        items = [_normalize_item(dict(x)) for x in (items_raw or [])]

        lib = LayoutLibrary(
            items=[LayoutItem(**it) for it in items],
            page=int(raw.get("page") or 1) if isinstance(raw, dict) else 1,
            page_size=int(raw.get("page_size") or max(1, len(items))) if isinstance(raw, dict) else max(1, len(items)),
            total=int(raw.get("total") or len(items)) if isinstance(raw, dict) else len(items),
        )
        mtime = path.stat().st_mtime
        LAYOUTS_JSON = path
        log.info("layouts_loaded path=%s total=%s", str(path), lib.total)
        return lib, mtime
    except Exception as e:
        log.warning("layouts_load_failed path=%s err=%s; using DEFAULT_LIB", str(path), type(e).__name__)
        return DEFAULT_LIB, None


# Load once at import
_LIB, _LAYOUTS_MTIME = _load_from_json()


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

    try:
        mtime = LAYOUTS_JSON.stat().st_mtime if LAYOUTS_JSON and LAYOUTS_JSON.exists() else None
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


def _section_slots(item: LayoutItem) -> int:
    """How many text buckets this layout exposes (via frames.sections)."""
    fr = getattr(item, "frames", None)
    if fr is None:
        return 0
    secs = fr.get("sections") if isinstance(fr, dict) else getattr(fr, "sections", None)
    if isinstance(secs, list):
        return len(secs)
    return 1 if secs else 0


def _desired_slots_for(text_count: int) -> int:
    """Heuristic: 1 slot for <=2 blocks, 2 for 3–6, 3 for 7+."""
    if text_count <= 2:
        return 1
    if text_count <= 6:
        return 2
    return 3


def _score_layout(item: LayoutItem, text_count: int, image_count: int) -> float:
    sup = item.supports or {}
    tmin, tmax = sup.get("text_min"), sup.get("text_max")
    imin, imax = sup.get("images_min"), sup.get("images_max")
    p = _penalty(text_count, tmin, tmax) + _penalty(image_count, imin, imax)
    if p == 0.0:
        p += (_closeness(text_count, tmin, tmax) + _closeness(image_count, imin, imax)) * 0.5

    slots = _section_slots(item)
    desired = _desired_slots_for(text_count)
    p += abs(slots - desired) * 0.35

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
