from __future__ import annotations

import time
import uuid
from typing import List, Optional, Any, Dict

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

# ---------- Theme presets (include fonts so UI/exporters can read weights safely)
THEME_PRESETS = {
    "default": {
        "fonts": {
            "heading": "Inter",
            "body": "Inter",
            "weightHeading": 700,
            "weightBody": 400,
            "letterSpacing": "0em",
        },
        "colors": {
            "surface": "#ffffff",
            "text": "#111827",
            "mutedText": "#475569",
        },
    },
    "dark": {
        "fonts": {
            "heading": "Inter",
            "body": "Inter",
            "weightHeading": 700,
            "weightBody": 400,
            "letterSpacing": "0em",
        },
        "colors": {
            "surface": "#0f172a",
            "text": "#e2e8f0",
            "mutedText": "#94a3b8",
        },
    },
}

# Lightweight idempotency cache for dev
_IDEMP_CACHE: dict[str, tuple[float, dict]] = {}
_IDEMP_TTL_SEC = 300  # 5 minutes

# Text sizing (points)
TITLE_PT = 40
BODY_PT = 22


class Selection(BaseModel):
    slide_id: str
    layout_id: Optional[str] = None  # if None or "auto", we will choose best-fit


class BuildRequest(BaseModel):
    deck: Deck
    selections: List[Selection]
    theme: str = "default"
    page: dict = {"width": 1280, "height": 720, "unit": "px"}
    policy: str = "best_fit"  # or "strict"
    warnings_as_errors: bool = False


# ---------------- helpers ----------------
def _normalize_section_blocks(slide) -> List[str]:
    """
    Convert slide.meta.sections (paragraph/list) into renderable text blocks.
    - paragraph -> text as-is
    - list -> joined with "- " prefix
    """
    meta = getattr(slide, "meta", None)
    secs = getattr(meta, "sections", None) or []
    blocks: List[str] = []
    for s in secs:
        kind = getattr(s, "kind", None) or (isinstance(s, dict) and s.get("kind"))
        if kind == "paragraph":
            text = (getattr(s, "text", None) or (isinstance(s, dict) and s.get("text")) or "").strip()
            if text:
                blocks.append(text)
        elif kind == "list":
            bullets = getattr(s, "bullets", None) or (isinstance(s, dict) and (s.get("bullets") or [])) or []
            bullets = [str(b).strip() for b in bullets if b and str(b).strip()]
            if bullets:
                blocks.append("\n".join(f"- {b}" for b in bullets))
    return blocks


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


def _frames_get(frames: Any, key: str):
    if frames is None:
        return None
    if isinstance(frames, dict):
        return frames.get(key)
    return getattr(frames, key, None)


def _frame_plain(f: Any) -> Dict[str, Any] | None:
    if f is None:
        return None
    if isinstance(f, dict):
        return f
    if hasattr(f, "model_dump"):
        try:
            return f.model_dump()
        except Exception:
            pass
    try:
        return {"x": int(getattr(f, "x")), "y": int(getattr(f, "y")), "w": int(getattr(f, "w")), "h": int(getattr(f, "h"))}
    except Exception:
        return None


def _style_get(style: Any, key: str) -> Dict[str, Any] | None:
    if style is None:
        return None
    if isinstance(style, dict):
        return style.get(key)
    return getattr(style, key, None)


def _get_section_frames(frames: Any) -> list[Dict[str, Any]]:
    """
    Accept modern frames.sections as well as legacy frames.text / frames.bullets.
    Returns a list of normalized frames dicts.
    """
    raw = (
        _frames_get(frames, "sections")
        or _frames_get(frames, "text")
        or _frames_get(frames, "bullets")
        or []
    )
    if not isinstance(raw, list):
        raw = [raw]
    out = [fp for fp in (_frame_plain(f) for f in raw) if fp]
    return out


def _section_slots(item: Any) -> int:
    fr = getattr(item, "frames", None)
    if fr is None:
        return 0
    return max(0, len(_get_section_frames(fr)))


def _desired_slots_for(text_count: int) -> int:
    if text_count <= 2:
        return 1
    if text_count <= 6:
        return 2
    return 3


def _score_layout(item: Any, text_count: int, image_count: int) -> float:
    """Lower is better; prefer multi-column when you have more sections."""
    sup: Dict[str, Any] = getattr(item, "supports", None) or {}
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
            out = dict(resp)
            out.setdefault("meta", {})["idempotency"] = "HIT"
            return JSONResponse(content=jsonable_encoder(out))

    warnings: list[dict] = []
    slides_out: List[EditorSlide] = []

    async with aspan("editor_build", policy=payload.policy, theme=payload.theme):
        deck = payload.deck
        layout_by_slide = {sel.slide_id: (sel.layout_id or None) for sel in payload.selections}

        lib = get_layout_library()

        # theme tokens
        T = THEME_PRESETS.get(payload.theme, THEME_PRESETS["default"])
        surface = T["colors"]["surface"]
        text = T["colors"]["text"]
        muted = T["colors"]["mutedText"]

        for s in deck.slides:
            with span("layout_apply_slide", slide_id=s.id):
                requested_layout_id = layout_by_slide.get(s.id)
                blocks = _normalize_section_blocks(s)
                text_count = len(blocks)
                image_count = len(getattr(s, "media", None) or [])

                # Choose layout: explicit -> lookup, else best-fit "auto"
                chosen = None
                if requested_layout_id and requested_layout_id != "auto":
                    chosen = next((li for li in lib.items if li.id == requested_layout_id), None)
                    if not chosen:
                        if payload.policy == "strict":
                            raise HTTPException(status_code=400, detail=f"Unknown layout_id {requested_layout_id} for slide {s.id}")
                        warnings.append({
                            "slide_id": s.id,
                            "reason": "unknown_layout_best_fit_substitution",
                            "requested": requested_layout_id,
                        })

                if chosen is None:
                    scored = sorted(lib.items, key=lambda li: _score_layout(li, text_count, image_count))
                    chosen = scored[0]
                    warnings.append({
                        "slide_id": s.id,
                        "reason": "auto_layout_selected",
                        "layout_id": chosen.id,
                        "text_count": text_count,
                        "image_count": image_count,
                    })

                layout = chosen
                layers: List[EditorLayer] = []

                # Title (emit both size + fontSize for exporter)
                title_fr = _frame_plain(_frames_get(layout.frames, "title"))
                if title_fr:
                    layers.append(EditorLayer(
                        id=f"ly_{s.id}_title",
                        kind="textbox",
                        frame=title_fr,
                        text=s.title,
                        style={
                            "font": T["fonts"]["heading"],
                            "size": TITLE_PT,
                            "fontSize": TITLE_PT,   # exporter-friendly
                            "weight": T["fonts"]["weightHeading"],
                            "align": "left",
                            "color": text,
                            "lineHeight": 1.2,
                        },
                        z=10,
                    ))

                # Sections (canonical) – accept sections/text/bullets in layout frames
                section_frames = _get_section_frames(layout.frames)
                if section_frames:
                    if text_count == 0:
                        detail = {
                            "code": "MISSING_TEXT_SECTIONS",
                            "message": f"slide {s.id} requires meta.sections for layout '{layout.id}'. Legacy 'bullets' is no longer supported.",
                        }
                        if payload.policy == "strict":
                            raise HTTPException(status_code=422, detail=detail)
                        warnings.append({"slide_id": s.id, **detail})

                    n_frames = len(section_frames)
                    if n_frames <= 1:
                        buckets = ["\n\n".join(blocks)]
                    else:
                        buckets = blocks[:n_frames]
                        if len(buckets) < n_frames:
                            buckets += [""] * (n_frames - len(buckets))
                        overflow = blocks[n_frames:]
                        if overflow:
                            buckets[-1] = (buckets[-1] + ("\n\n" if buckets[-1] else "")) + "\n\n".join(overflow)

                    sec_style = dict(_style_get(layout.style, "sections") or {})
                    sec_style.setdefault("font", T["fonts"]["body"])
                    sec_style.setdefault("size", BODY_PT)
                    sec_style.setdefault("fontSize", sec_style["size"])  # exporter alias
                    sec_style.setdefault("color", muted)
                    sec_style.setdefault("lineHeight", 1.25)

                    for idx, (fr, txt_block) in enumerate(zip(section_frames, buckets)):
                        if not (txt_block or "").strip():
                            continue
                        layers.append(EditorLayer(
                            id=f"ly_{s.id}_sec{idx}",
                            kind="textbox",
                            frame=fr,
                            text=txt_block,
                            style=sec_style,
                            z=9,
                        ))
                elif text_count > 0:
                    warnings.append({
                        "slide_id": s.id,
                        "reason": "text_ignored_by_layout",
                        "layout_id": layout.id,
                        "text_count": text_count,
                    })

                # Images
                image_frames_raw = _frames_get(layout.frames, "images") or []
                if not isinstance(image_frames_raw, list):
                    image_frames_raw = [image_frames_raw]
                image_frames = [fp for fp in (_frame_plain(f) for f in image_frames_raw) if fp]

                if image_frames and s.media:
                    imgs = []
                    for m in (s.media or []):
                        if isinstance(m, dict):
                            u = m.get("url")
                            if u: imgs.append({"url": u, "source": m.get("source"), "asset_id": m.get("asset_id")})
                        else:
                            u = getattr(m, "url", None)
                            if u: imgs.append({"url": u, "source": getattr(m, "source", None), "asset_id": getattr(m, "asset_id", None)})

                    for j, (m, fr) in enumerate(zip(imgs, image_frames)):
                        layers.append(EditorLayer(
                            id=f"ly_{s.id}_img{j}",
                            kind="image",
                            frame=fr,
                            source={"type": m.get("source") or "external", "asset_id": m.get("asset_id"), "url": m["url"]},
                            fit="cover",
                            z=6,
                        ))
                elif image_count > 0 and not image_frames:
                    warnings.append({
                        "slide_id": s.id,
                        "reason": "images_ignored_by_layout",
                        "layout_id": layout.id,
                        "image_count": image_count,
                    })

                slides_out.append(EditorSlide(
                    id=s.id,
                    name=s.title,
                    background={"fill": surface},
                    layers=layers,
                    meta={"layout_id": layout.id},
                ))

        page = {**payload.page, "background": {"fill": surface}}

        editor = EditorDoc(
            editor_id=f"ed_{uuid.uuid4().hex[:12]}",
            deck_id=f"dk_{uuid.uuid4().hex[:8]}",
            page=page,
            theme=payload.theme,
            slides=slides_out,
            meta={"created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")},
            theme_meta=T,  # includes fonts + colors
        )

    resp = {"editor": editor, "warnings": warnings}

    if idempotency_key:
        _IDEMP_CACHE[idempotency_key] = (now, resp)

    return JSONResponse(content=jsonable_encoder(resp))
