from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator

class ParsedPreview(BaseModel):
    kind: Literal["pdf", "docx", "text"] = "text"
    pages: int = 0
    text: str = Field(default="", exclude=True)
    text_length: int = 0
    text_preview: str = Field(default="", description="First ~1000 chars")

    @model_validator(mode="after")
    def _derive_preview_and_length(self):
        if not self.text_preview and self.text:
            self.text_preview = self.text[:1000]
        self.text_length = len(self.text or "")
        return self

class UploadMeta(BaseModel):
    filename: str
    size: int = Field(..., ge=0, description="bytes")
    content_type: str = "application/octet-stream"
    path: Optional[str] = Field(None, description="Absolute path on server (dev only)")
    parsed: ParsedPreview

class UploadResponse(UploadMeta):
    pass
