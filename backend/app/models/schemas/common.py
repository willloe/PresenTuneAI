from pydantic import BaseModel, Field
from typing import Optional


class RequestMeta(BaseModel):
    """Optional correlation info we may attach in responses (dev only)."""

    request_id: Optional[str] = Field(
        default=None, description="x-request-id correlation id"
    )
    duration_ms: Optional[int] = Field(
        default=None, description="total request time (ms)"
    )
