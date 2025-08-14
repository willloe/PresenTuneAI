from __future__ import annotations
from typing import List, Literal, Optional, Dict, Any
from pydantic import BaseModel


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
    background: dict = {"fill": "#FFFFFF"}
    layers: List[EditorLayer]
    meta: dict = {}


class EditorDoc(BaseModel):
    editor_id: str
    deck_id: str
    version: str = "1.0"
    page: dict
    theme: str = "default"
    slides: List[EditorSlide]
    meta: dict = {}
