from pathlib import Path
from typing import Tuple
from docx import Document

from app.core.telemetry import span
from app.models.schemas.upload import ParsedPreview

def _read_pdf(path: Path) -> Tuple[str, int]:
    import pdfplumber
    with span("read_pdf", file=str(path)):
        text_parts = []
        pages = 0
        with pdfplumber.open(path) as pdf:
            pages = len(pdf.pages)
            for p in pdf.pages:
                text_parts.append(p.extract_text() or "")
        return "\n".join(text_parts), pages

def _read_docx(path: Path) -> Tuple[str, int]:
    with span("read_docx", file=str(path)):
        doc = Document(str(path))
        text = "\n".join(p.text for p in doc.paragraphs if p.text)
        return text, 0  # pages unknown from docx

def parse_file(path: Path, content_type: str | None) -> ParsedPreview:
    with span("parse_file", file=str(path), content_type=content_type or "unknown"):
        path = Path(path)
        ext = path.suffix.lower()
        text, pages = "", 0

        if (content_type and "pdf" in content_type) or ext == ".pdf":
            text, pages = _read_pdf(path)
            kind = "pdf"
        elif (content_type and "word" in content_type) or ext in {".docx"}:
            text, pages = _read_docx(path)
            kind = "docx"
        else:
            with span("read_text", file=str(path)):
                text = path.read_text(errors="ignore")
            kind = "text"

        text = (text or "").strip()
        return ParsedPreview(
            kind=kind,
            pages=pages,
            text=text,
            text_length=len(text),
            text_preview=text[:1000],
        )
