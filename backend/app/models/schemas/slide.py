from typing import List, Literal, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class Media(BaseModel):
    type: Literal["image"] = "image"
    url: str
    alt: Optional[str] = None

class Slide(BaseModel):
    id: str = Field(..., description="Client/UI-generated id (uuid/ulid)")
    title: str = Field(..., min_length=1, max_length=200)
    bullets: List[str] = Field(default_factory=list, description="Bullet points")
    notes: Optional[str] = None
    layout: Literal["title", "title-bullets", "two-col"] = "title-bullets"
    media: List[Media] = Field(default_factory=list)

class Deck(BaseModel):
    version: str = "1.0"
    topic: Optional[str] = None
    source: Optional[dict] = Field(
        default=None,
        description="e.g. {'file_id': 'abc', 'filename': 'doc.pdf'}"
    )
    slide_count: int = Field(..., ge=1, le=50)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    slides: List[Slide]
