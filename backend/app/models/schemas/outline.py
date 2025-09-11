from typing import Optional
from pydantic import BaseModel, Field, AliasChoices, ConfigDict

class OutlineRequest(BaseModel):
    # Pydantic v2 config
    model_config = ConfigDict(
        populate_by_name=True,
        str_strip_whitespace=True,
        extra="ignore",
    )

    # Accept snake (client) and camel (future/SDK) just in case
    upload_id: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices("upload_id", "uploadId"),
        description="ID of a prior upload to source parsed text from",
    )
    topic: Optional[str] = Field(
        default=None, description="Optional topic provided by user"
    )
    text: Optional[str] = Field(
        default=None, description="Raw text extracted from document or user input"
    )
    slide_count: int = Field(
        default=5, ge=1, le=15, description="How many slides to generate (1–15)"
    )
