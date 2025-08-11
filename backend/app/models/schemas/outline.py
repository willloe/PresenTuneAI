from pydantic import BaseModel, Field
from app.models.schemas.common import Slide

class OutlineRequest(BaseModel):
    text: str = Field(..., description="Raw text extracted from document or user input")
    slide_count: int = 8

class OutlineResponse(BaseModel):
    slides: list[Slide]
