from pydantic import BaseModel
from app.models.schemas.common import Slide

class ExportRequest(BaseModel):
    slides: list[Slide]
    theme: str | None = None

class ExportResponse(BaseModel):
    path: str
