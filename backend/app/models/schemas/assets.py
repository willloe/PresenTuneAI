from __future__ import annotations
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, List, Dict, Any
from datetime import datetime

class BBox(BaseModel):
    # For pdffigures2 later; keep nullable for MVP
    page: Optional[int] = None
    x1: Optional[float] = None
    y1: Optional[float] = None
    x2: Optional[float] = None
    y2: Optional[float] = None

class Asset(BaseModel):
    id: str
    kind: str = "image"
    upload_id: str
    filename: str
    rel_path: str                  # path relative to repo root (or to a configured base)
    width: Optional[int] = None
    height: Optional[int] = None
    ext: Optional[str] = None
    checksum: Optional[str] = None
    bbox: Optional[BBox] = None
    caption: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class AssetList(BaseModel):
    items: List[Asset]
    count: int
