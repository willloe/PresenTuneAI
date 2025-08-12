# backend/app/models/schemas/outline.py
from pydantic import BaseModel, Field
from typing import Optional

class OutlineRequest(BaseModel):
    topic: Optional[str] = Field(
        default=None, description="Optional topic provided by user"
    )
    text: Optional[str] = Field(
        default=None, description="Raw text extracted from document or user input"
    )
    slide_count: int = Field(
        default=5, ge=1, le=15, description="How many slides to generate (1–15)"
    )

# (Optional) keep for reference; endpoint currently returns Deck instead
# from app.models.schemas.common import Slide
# class OutlineResponse(BaseModel):
#     slides: list[Slide]
