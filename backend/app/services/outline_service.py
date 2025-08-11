from app.models.schemas.common import Slide

async def build_outline_placeholder(text: str, slide_count: int = 8) -> list[Slide]:
    # naive split by sentences/lines; tweak for demo
    title = (text.strip().splitlines() or ["Untitled"])[0][:80]
    slides = []
    for i in range(slide_count):
        slides.append(Slide(
            title=f"{title} — Part {i+1}",
            bullets=[f"Key point {i+1}.1", f"Key point {i+1}.2"],
            image_hint=None
        ))
    return slides
