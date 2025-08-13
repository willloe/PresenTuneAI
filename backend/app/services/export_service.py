from pathlib import Path
from datetime import datetime
import re

from app.core.telemetry import aspan
from app.models.schemas.slide import Slide
from app.models.schemas.export import ExportResponse

_SLIDE_PREFIX = re.compile(r"^\s*Slide\s+\d+:\s*", re.IGNORECASE)

async def export_to_pptx(slides: list[Slide], theme: str = "default") -> ExportResponse:
    out_dir = Path("data/exports")
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_path = out_dir / f"deck_{stamp}_{theme}.txt"

    async with aspan("export_txt", theme=theme, slides=len(slides), out=str(out_path)):
        with out_path.open("w", encoding="utf-8") as f:
            for idx, s in enumerate(slides, start=1):
                title = (s.title or f"Slide {idx}").strip()
                header = title if _SLIDE_PREFIX.match(title) else f"Slide {idx}: {title}"
                f.write(f"{header}\n")
                for b in s.bullets or []:
                    f.write(f"  - {b}\n")
                if getattr(s, "notes", None):
                    f.write(f"  [notes] {s.notes}\n")
                if getattr(s, "media", None):
                    for m in s.media:
                        f.write(f"  [media] {m.type} {m.url}")
                        if getattr(m, "alt", None):
                            f.write(f"  — {m.alt}")
                        f.write("\n")
                f.write("\n")

    return ExportResponse(
        path=str(out_path.resolve()),
        format="txt",
        theme=theme,
        bytes=out_path.stat().st_size,
    )
