from __future__ import annotations

from typing import Optional, Literal, List
from pydantic import BaseModel, Field, model_validator
from app.models.schemas.slide import Slide

# ───────── Theme metadata (typed, all fields optional for flexibility) ─────────
class ThemeFonts(BaseModel):
    heading: Optional[str] = None
    body: Optional[str] = None
    weightHeading: Optional[int] = None  # e.g., 700
    weightBody: Optional[int] = None     # e.g., 400


class ThemeColors(BaseModel):
    appBg: Optional[str] = None
    surface: Optional[str] = None
    text: Optional[str] = None
    mutedText: Optional[str] = None
    border: Optional[str] = None
    accent: Optional[str] = None
    accentContrast: Optional[str] = None
    accentSoft: Optional[str] = None


class ThemeMeta(BaseModel):
    fonts: Optional[ThemeFonts] = None
    colors: Optional[ThemeColors] = None
    # room to grow without breaking clients:
    # radius: Optional[int] = None
    # shadow: Optional[str] = None


# ───────── Minimal "Editor" input models (fields we need to render) ─────────
class EditorSource(BaseModel):
    type: Optional[str] = None
    url: Optional[str] = None
    asset_id: Optional[str] = None


class EditorFrame(BaseModel):
    x: float
    y: float
    w: float
    h: float


class EditorLayer(BaseModel):
    id: str
    kind: Literal["textbox", "image", "shape"]
    frame: EditorFrame
    text: Optional[str] = None
    style: Optional[dict] = None
    source: Optional[EditorSource | dict] = None
    fit: Optional[Literal["cover", "contain", "fill"]] = None
    z: int = 0


class EditorSlideIn(BaseModel):
    id: str
    name: str
    background: Optional[dict] = None
    layers: List[EditorLayer] = Field(default_factory=list)
    meta: Optional[dict] = None


class EditorDocIn(BaseModel):
    editor_id: Optional[str] = None
    deck_id: Optional[str] = None
    version: Optional[str] = None
    page: Optional[dict] = None  # {"width": 1280, "height": 720, "unit": "px"}
    theme: Optional[str] = None
    slides: List[EditorSlideIn] = Field(default_factory=list)
    meta: Optional[dict] = None
    theme_meta: Optional[ThemeMeta] = None  # ← carries design tokens


# ─────────────────────────── Public request/response ─────────────────────────
class ExportRequest(BaseModel):
    # Exactly one of these must be provided
    slides: Optional[list[Slide]] = None
    editor: Optional[EditorDocIn] = None

    # Optional theme tag & tokens
    theme: Optional[str] = None
    theme_meta: Optional[ThemeMeta] = None

    @model_validator(mode="after")
    def _validate_exactly_one(self) -> "ExportRequest":
        has_slides = bool(self.slides)
        has_editor = bool(self.editor)
        if has_slides == has_editor:
            raise ValueError("Provide exactly one of 'slides' or 'editor'.")
        return self


class ExportResponse(BaseModel):
    path: str
    format: Literal["pptx", "txt"] = "pptx"
    theme: Optional[str] = None
    bytes: int = Field(..., ge=0)
