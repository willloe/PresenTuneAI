from pathlib import Path
from datetime import datetime
from app.models.schemas.common import Slide

async def export_to_pptx(slides: list[Slide], theme: str = "default") -> str:
    out_dir = Path("data/exports")
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_path = out_dir / f"deck_{stamp}_{theme}.txt"
    with out_path.open("w", encoding="utf-8") as f:
        for idx, s in enumerate(slides, start=1):
            f.write(f"Slide {idx}: {s.title}\n")
            for b in s.bullets:
                f.write(f"  - {b}\n")
            if s.image_hint:
                f.write(f"  [image_hint] {s.image_hint}\n")
            f.write("\n")
    return str(out_path.resolve())
