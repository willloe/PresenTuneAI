from __future__ import annotations
from typing import Dict, List, Optional
from pydantic import BaseModel


class Frame(BaseModel):
    x: int
    y: int
    w: int
    h: int


class LayoutItem(BaseModel):
    id: str
    name: str
    # e.g., {"text_min":1,"text_max":12,"images_min":0,"images_max":2}
    supports: Dict[str, int]
    weight: float
    preview_url: Optional[str] = None
    # {"title": Frame, "bullets": [Frame], "images": [Frame]}
    frames: Dict[str, object]
    style: Dict[str, object] = {}


class LayoutLibrary(BaseModel):
    items: List[LayoutItem]
    page: int = 1
    page_size: int = 100
    total: int


class LayoutFilterRequest(BaseModel):
    # {"text_count": 5, "image_count": 1}
    components: Dict[str, int]
    top_k: int = 5
