from typing import Optional, Literal
from pydantic import BaseModel, Field
from app.models.schemas.slide import Slide


class ExportRequest(BaseModel):
    slides: list[Slide]
    theme: Optional[str] = None


class ExportResponse(BaseModel):
    path: str
    format: Literal["pptx", "txt"] = "pptx"
    theme: Optional[str] = None
    bytes: int = Field(..., ge=0)
