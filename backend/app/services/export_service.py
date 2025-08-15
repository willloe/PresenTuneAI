from __future__ import annotations

from pathlib import Path
from datetime import datetime
import re

from app.core.telemetry import aspan
from app.models.schemas.slide import Slide
from app.models.schemas.export import ExportResponse

_SLIDE_PREFIX = re.compile(r"^\s*Slide\s+\d+:\s*", re.IGNORECASE)


async def export_to_pptx(slides: list[Slide], theme: str = "default") -> ExportResponse:
    """
    Export slides to a real .pptx. If python-pptx isn't available, fall back to .txt.
    - Title becomes slide title (prefixed with 'Slide N:' if not already)
    - Bullets go into the content placeholder (or a textbox if missing)
    - Notes (and media references) go into the slide notes
    """
    out_dir = Path("data/exports").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    pptx_path = out_dir / f"deck_{stamp}_{theme}.pptx"

    # Try to import python-pptx; if unavailable, fall back to plain text export
    try:
        from pptx import Presentation
        from pptx.util import Inches  # used for textbox fallback
    except Exception as e:
        # Fallback: write .txt exactly like your original implementation
        txt_path = out_dir / f"deck_{stamp}_{theme}.txt"
        async with aspan("export_txt_fallback", theme=theme, slides=len(slides), out=str(txt_path), reason=type(e).__name__):
            with txt_path.open("w", encoding="utf-8") as f:
                for idx, s in enumerate(slides, start=1):
                    title = (s.title or f"Slide {idx}").strip()
                    header = title if _SLIDE_PREFIX.match(title) else f"Slide {idx}: {title}"
                    f.write(f"{header}\n")
                    for b in (s.bullets or []):
                        f.write(f"  - {b}\n")
                    if getattr(s, "notes", None):
                        f.write(f"  [notes] {s.notes}\n")
                    if getattr(s, "media", None):
                        for m in s.media:
                            url = getattr(m, "url", None) if not isinstance(m, dict) else m.get("url")
                            alt = getattr(m, "alt", None) if not isinstance(m, dict) else m.get("alt")
                            typ = getattr(m, "type", "image") if not isinstance(m, dict) else m.get("type", "image")
                            f.write(f"  [media] {typ} {url or ''}")
                            if alt:
                                f.write(f" — {alt}")
                            f.write("\n")
                    f.write("\n")
        return ExportResponse(
            path=str(txt_path),
            format="txt",
            theme=theme,
            bytes=txt_path.stat().st_size,
        )

    # Real PPTX export
    async with aspan("export_pptx", theme=theme, slides=len(slides), out=str(pptx_path)):
        pres = Presentation()
        title_layout = pres.slide_layouts[0]  # Title
        content_layout = pres.slide_layouts[1] if len(pres.slide_layouts) > 1 else title_layout  # Title + Content

        for idx, s in enumerate(slides, start=1):
            title_text = (s.title or f"Slide {idx}").strip()
            header = title_text if _SLIDE_PREFIX.match(title_text) else f"Slide {idx}: {title_text}"

            # Choose layout based on bullets
            if s.bullets:
                slide = pres.slides.add_slide(content_layout)
                # Title
                slide.shapes.title.text = header
                # Bullets into content placeholder if present, else textbox
                if len(slide.placeholders) > 1:
                    tf = slide.placeholders[1].text_frame
                    tf.clear()
                    for i, b in enumerate(s.bullets):
                        if i == 0:
                            tf.text = b
                        else:
                            p = tf.add_paragraph()
                            p.text = b
                            p.level = 0
                else:
                    # Fallback textbox
                    box = slide.shapes.add_textbox(Inches(1), Inches(2), Inches(8), Inches(4))
                    tf = box.text_frame
                    for i, b in enumerate(s.bullets):
                        if i == 0:
                            tf.text = b
                        else:
                            tf.add_paragraph().text = b
            else:
                slide = pres.slides.add_slide(title_layout)
                slide.shapes.title.text = header

            # Notes
            if getattr(s, "notes", None):
                slide.notes_slide.notes_text_frame.text = s.notes

            # Media references listed in notes
            if getattr(s, "media", None):
                notes_tf = slide.notes_slide.notes_text_frame
                if not notes_tf.text:
                    notes_tf.text = ""
                for m in s.media:
                    if isinstance(m, dict):
                        url = m.get("url"); alt = m.get("alt"); typ = m.get("type", "image")
                    else:
                        url = getattr(m, "url", None)
                        alt = getattr(m, "alt", None)
                        typ = getattr(m, "type", "image")
                    para = notes_tf.add_paragraph()
                    para.text = f"[media] {typ} {url or ''}" + (f" — {alt}" if alt else "")

        pres.save(str(pptx_path))

    return ExportResponse(
        path=str(pptx_path),
        format="pptx",
        theme=theme,
        bytes=pptx_path.stat().st_size,
    )
