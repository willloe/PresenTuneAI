from pydantic import BaseModel, Field

class Slide(BaseModel):
    title: str = Field(..., description="Slide title")
    bullets: list[str] = Field(default_factory=list, description="Bullet points")
    image_hint: str | None = None  # placeholder for Week 2+
