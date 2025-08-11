from pydantic import BaseModel

class UploadResponse(BaseModel):
    path: str
    parsed_preview: dict  # e.g., {"pages": 3, "headings": [...]} keep it loose for Week 1
