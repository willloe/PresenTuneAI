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
    # Use the new id that matches the layouts library.
    layout: Optional[str] = Field(default="title_bullets_left")

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
        Keep legacy `bullets[]` and canonical `meta.sections[]` in sync.

        Fixes:
        - Detect dict-shaped list sections (not only ListSection instances).
        - Only create a list section from legacy bullets when there are *no* sections.
        - Clear legacy bullets when there is no list section so we don't mirror paragraphs
          into a phantom list on the server.
        """
        sections = list(self.meta.sections) if (self.meta and self.meta.sections) else []

        def _kind(sec) -> str:
            if isinstance(sec, dict):
                return str(sec.get("kind", "")).lower()
            return str(getattr(sec, "kind", "")).lower()

        def _role(sec) -> str:
            if isinstance(sec, dict):
                return str(sec.get("role", "")).lower()
            return str(getattr(sec, "role", "")).lower()

        def _get_bullets(sec) -> list[str]:
            if isinstance(sec, dict):
                return list(sec.get("bullets") or [])
            if isinstance(sec, ListSection):
                return list(sec.bullets or [])
            return []

        # Find a list section; prefer one marked primary
        list_ix: Optional[int] = None
        for i, sec in enumerate(sections):
            if _kind(sec) == "list":
                list_ix = i
                if _role(sec) == "primary":
                    break

        if list_ix is not None:
            # Mirror list bullets into legacy bullets; if list is empty but legacy bullets exist, push them back
            list_sec = sections[list_ix]
            bullets = [b.strip() for b in _get_bullets(list_sec) if b and str(b).strip()]

            if bullets:
                object.__setattr__(self, "bullets", list(bullets))
            elif self.bullets:
                # Sections list is empty but legacy bullets present → use them
                if isinstance(list_sec, ListSection):
                    list_sec.bullets = list(self.bullets)
                else:
                    # dict-shaped section
                    list_sec["bullets"] = list(self.bullets)

        else:
            # No list section present:
            # Only create a list section from legacy bullets if there are *no sections at all*.
            if self.bullets and not sections:
                sections.append(
                    ListSection(
                        id=f"{self.id}-l1",
                        bullets=list(self.bullets),
                        role="primary",
                    )
                )
            else:
                # We have paragraphs/other sections: clear legacy bullets to avoid phantom list duplication
                object.__setattr__(self, "bullets", None)

        # Write back sections (if any)
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
