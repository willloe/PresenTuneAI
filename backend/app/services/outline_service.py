from app.core.telemetry import aspan
from app.models.schemas.slide import Slide

async def build_outline_placeholder(text: str, slide_count: int = 8) -> list[Slide]:
    async with aspan("outline_stub_generate", chars=len(text), slide_count=slide_count):
        title = (text.strip().splitlines() or ["Untitled"])[0][:80]
        slides: list[Slide] = []
        for i in range(slide_count):
            slides.append(
                Slide(
                    title=f"{title} — Part {i+1}",
                    bullets=[f"Key point {i+1}.1", f"Key point {i+1}.2"],
                    image_hint=None,  # if your Slide has this field
                )
            )
        return slides
