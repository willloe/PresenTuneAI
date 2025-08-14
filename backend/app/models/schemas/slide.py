from typing import List, Literal, Optional
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
from datetime import datetime
from app.core.version import SCHEMA_VERSION


class Media(BaseModel):
    type: Literal["image"] = "image"
    url: Optional[HttpUrl] = None
    alt: Optional[str] = Field(default=None, max_length=160)
    # Forward-compat for editor/build: allow asset-sourced media
    source: Optional[Literal["asset", "external"]] = None
    asset_id: Optional[str] = None


class Slide(BaseModel):
    id: str = Field(..., description="Client/UI-generated id (uuid/ulid)")
    title: str = Field(..., min_length=1, max_length=200)
    bullets: List[str] = Field(
        default_factory=list, description="Bullet points", max_items=12
    )
    notes: Optional[str] = Field(default=None, max_length=4000)
    layout: Optional[str] = "title-bullets"
    media: List[Media] = Field(default_factory=list)

    @field_validator("bullets", mode="after")
    @classmethod
    def _trim_bullets(cls, v: List[str]) -> List[str]:
        return [b.strip() for b in v if b and b.strip()]


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
    def _sync_counts(self):
        object.__setattr__(self, "slide_count", len(self.slides))
        return self
