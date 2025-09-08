from pydantic import BaseModel
from typing import List, Optional

class ImageAsset(BaseModel):
    url: str

class ImageGenRequest(BaseModel):
    prompt: str
    size: Optional[str] = "1024x1024"
    n: Optional[int] = 1
    style: Optional[str] = None
    reference_image: Optional[str] = None
    mask: Optional[str] = None

class ImageGenResponse(BaseModel):
    assets: List[ImageAsset]
    provider: Optional[str] = None
    model: Optional[str] = None
    used_query: Optional[str] = None
