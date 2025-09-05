from __future__ import annotations
from typing import Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class Frame(BaseModel):
    x: int
    y: int
    w: int
    h: int


class LayoutFrames(BaseModel):
    """
    Canonical frames for a layout.
    - title: single text frame for slide title
    - sections: array of text frames (maps to meta.sections[])
    - images: array of image frames
    """
    model_config = ConfigDict(extra="allow")

    title: Optional[Frame] = None
    sections: Optional[List[Frame]] = None
    images: Optional[List[Frame]] = None


class LayoutStyle(BaseModel):
    """
    Optional per-slot style hints read by the editor/exporters.
    """
    model_config = ConfigDict(extra="allow")

    title: Optional[Dict[str, object]] = None
    sections: Optional[Dict[str, object]] = None
    images: Optional[Dict[str, object]] = None


class LayoutItem(BaseModel):
    id: str
    name: str
    # e.g., {"text_min":1,"text_max":12,"images_min":0,"images_max":2}
    supports: Dict[str, int]
    weight: float
    preview_url: Optional[str] = None
    frames: LayoutFrames = Field(default_factory=LayoutFrames)
    style: LayoutStyle = Field(default_factory=LayoutStyle)


class LayoutLibrary(BaseModel):
    items: List[LayoutItem]
    page: int = 1
    page_size: int = 100
    total: int


class LayoutFilterRequest(BaseModel):
    # {"text_count": 5, "image_count": 1}
    components: Dict[str, int]
    top_k: int = 5
