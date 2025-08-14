from __future__ import annotations

from fastapi import APIRouter, Depends
from app.core.auth import require_token
from app.core.config import settings
from app.models.schemas.layouts import LayoutLibrary, LayoutItem, LayoutFilterRequest, Frame

router = APIRouter(
    tags=["layouts"],
    dependencies=([Depends(require_token)] if settings.AUTH_ENABLED else []),
)

LIB = LayoutLibrary(
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

@router.get("/layouts", response_model=LayoutLibrary)
def list_layouts() -> LayoutLibrary:
    return LIB

@router.post("/layouts/filter")
def filter_layouts(req: LayoutFilterRequest):
    # Minimal heuristic: rank by weight; return top_k ids
    candidates = sorted(LIB.items, key=lambda li: -li.weight)
    topk = max(1, min(req.top_k, 20))
    return {"candidates": [li.id for li in candidates[:topk]]}
