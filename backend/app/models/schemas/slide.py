from __future__ import annotations

from typing import List, Literal, Optional, Union
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator, ConfigDict
from datetime import datetime
from app.core.version import SCHEMA_VERSION


# ---- Media -------------------------------------------------------------------

class Media(BaseModel):
    """Image/media reference. Forward-compatible with asset storage."""
    type: Literal["image"] = "image"
    url: Optional[HttpUrl] = None
    alt: Optional[str] = Field(default=None, max_length=160)
    # Forward-compat for editor/build: allow asset-sourced media
    source: Optional[Literal["asset", "external"]] = None
    asset_id: Optional[str] = None


# ---- Text Sections (canonical multi-text model) -------------------------------

class ParagraphSection(BaseModel):
    kind: Literal["paragraph"] = "paragraph"
    id: str = Field(..., description="Client-generated id (uuid/ulid)")
    text: str = Field(..., min_length=1)
    role: Optional[str] = Field(default=None, description="e.g. 'primary'/'secondary' etc.")


class ListSection(BaseModel):
    kind: Literal["list"] = "list"
    id: str = Field(..., description="Client-generated id (uuid/ulid)")
    bullets: List[str] = Field(default_factory=list, max_items=24)
    role: Optional[str] = Field(default=None, description="e.g. 'primary'/'secondary' etc.")

    @field_validator("bullets", mode="after")
    @classmethod
    def _trim_bullets(cls, v: List[str]) -> List[str]:
        return [b.strip() for b in v if b and b.strip()]


TextSection = Union[ParagraphSection, ListSection]


class Meta(BaseModel):
    """Extensible slide metadata; sections[] is the canonical text model."""
    model_config = ConfigDict(extra="allow")

    sections: Optional[List[TextSection]] = None


# ---- Slide / Deck -------------------------------------------------------------

class Slide(BaseModel):
    id: str = Field(..., description="Client/UI-generated id (uuid/ulid)")
    title: str = Field(..., min_length=1, max_length=200)

    # Legacy mirror of primary list (kept for compatibility with older clients)
    bullets: Optional[List[str]] = Field(default=None, description="Legacy bullets; mirrored to/from sections")

    notes: Optional[str] = Field(default=None, max_length=4000)

    # Layout is advisory here (actual placement happens in /editor/build)
    layout: Optional[str] = Field(default="title-bullets")

    # Zero or more images
    media: Optional[List[Media]] = Field(default_factory=list)

    # Canonical text model & extension point
    meta: Optional[Meta] = None

    @field_validator("bullets", mode="after")
    @classmethod
    def _trim_legacy_bullets(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return None
        return [b.strip() for b in v if b and b.strip()]

    @model_validator(mode="after")
    def _sync_bullets_and_sections(self) -> "Slide":
        """
        Keep legacy `bullets[]` and canonical `meta.sections[]` in sync:
        - If sections has a primary (or first) list, mirror it into bullets.
        - Else if bullets exist but no list section, create a primary list section.
        """
        sections = list(self.meta.sections) if (self.meta and self.meta.sections) else []

        # Locate a primary list section (or first list section)
        list_ix = None
        for i, sec in enumerate(sections):
            if isinstance(sec, ListSection):
                list_ix = i
                # Prefer the one marked primary
                if (sec.role or "").lower() == "primary":
                    list_ix = i
                    break

        if list_ix is not None:
            # Mirror to legacy bullets
            list_sec: ListSection = sections[list_ix]  # type: ignore[assignment]
            if list_sec.bullets:
                object.__setattr__(self, "bullets", list(list_sec.bullets))
            elif self.bullets:
                # Sections list is empty but legacy bullets present → use them
                list_sec.bullets = list(self.bullets)

        else:
            # No list section present; if legacy bullets exist, create a primary list section
            if self.bullets:
                sections.append(
                    ListSection(
                        id=f"{self.id}-l1",
                        bullets=list(self.bullets),
                        role="primary",
                    )
                )

        # Write back sections (if we assembled any)
        if self.meta is None:
            object.__setattr__(self, "meta", Meta(sections=sections if sections else None))
        else:
            self.meta.sections = sections if sections else None

        return self


class Deck(BaseModel):
    version: str = SCHEMA_VERSION
    topic: Optional[str] = None
    source: Optional[dict] = Field(
        default=None, description="e.g. {'file_id':'abc','filename':'doc.pdf'}"
    )
    slide_count: int = Field(..., ge=1, le=50)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    slides: List[Slide]

    @model_validator(mode="after")
    def _sync_counts(self) -> "Deck":
        object.__setattr__(self, "slide_count", len(self.slides))
        return self
