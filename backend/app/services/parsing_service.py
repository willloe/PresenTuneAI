from pathlib import Path
from typing import Tuple
from docx import Document

def _read_pdf(path: Path) -> Tuple[str, int]:
    import pdfplumber
    text_parts = []
    pages = 0
    with pdfplumber.open(path) as pdf:
        pages = len(pdf.pages)
        for p in pdf.pages:
            text_parts.append(p.extract_text() or "")
    return "\n".join(text_parts), pages

def _read_docx(path: Path) -> Tuple[str, int]:
    doc = Document(str(path))
    text = "\n".join(p.text for p in doc.paragraphs if p.text)
    return text, 0  # pages unknown from docx

def parse_file(path: Path, content_type: str | None) -> dict:
    path = Path(path)
    ext = path.suffix.lower()
    text, pages = "", 0

    if content_type and "pdf" in content_type or ext == ".pdf":
        text, pages = _read_pdf(path)
        kind = "pdf"
    elif content_type and "word" in content_type or ext in {".docx"}:
        text, pages = _read_docx(path)
        kind = "docx"
    else:
        # default: best effort read as text
        text = path.read_text(errors="ignore")
        kind = "text"

    text = (text or "").strip()
    return {
        "kind": kind,
        "pages": pages,
        "text": text,
        "text_length": len(text),
        "text_preview": text[:1000],
    }
