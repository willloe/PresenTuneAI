from __future__ import annotations
from typing import List, Literal, Optional, Dict, Any
from pydantic import BaseModel, Field


class EditorLayer(BaseModel):
    id: str
    kind: Literal["textbox", "image", "shape"]
    frame: Dict[str, Any]
    text: Optional[str] = None
    style: Optional[dict] = None
    source: Optional[dict] = None  # {"type":"external|asset","asset_id":..., "url":...}
    fit: Optional[Literal["cover", "contain", "fill"]] = None
    z: int = 0


class EditorSlide(BaseModel):
    id: str
    name: str
    background: dict = Field(default_factory=dict)
    layers: List[EditorLayer]
    meta: dict = Field(default_factory=dict)


class EditorDoc(BaseModel):
    editor_id: str
    deck_id: str
    version: str = "1.0"
    page: dict
    theme: str = "default"
    theme_meta: Optional[dict] = None
    slides: List[EditorSlide]
    meta: dict = Field(default_factory=dict)
