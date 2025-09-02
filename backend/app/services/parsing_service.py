from __future__ import annotations

from pathlib import Path
from typing import List, Tuple

import hashlib
import io
import os
import uuid

import fitz  # PyMuPDF
from PIL import Image
from docx import Document

from app.core.telemetry import span
from app.models.schemas.assets import Asset
from app.models.schemas.upload import ParsedPreview


# ────────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────────

def _ensure_dir(path: str) -> None:
    """Create directory if it does not already exist."""
    os.makedirs(path, exist_ok=True)


def _sha256_bytes(b: bytes) -> str:
    """Checksum for dedup / integrity tracking."""
    h = hashlib.sha256()
    h.update(b)
    return h.hexdigest()


# ────────────────────────────────────────────────────────────────────────────────
# Public: extract_images (MVP raster extraction)
# ────────────────────────────────────────────────────────────────────────────────

def extract_images(pdf_path: str, out_dir: str, upload_id: str) -> List[Asset]:
    """
    Extract embedded raster images from a PDF using PyMuPDF.

    - Normalizes outputs to PNG (handles odd encodings/transparency).
    - Saves files under `out_dir`.
    - Returns a list of Asset objects (NOT persisted).

    Parameters
    ----------
    pdf_path : str
        Absolute path to the source PDF.
    out_dir : str
        Directory where extracted images should be written.
    upload_id : str
        Upload identifier used to build stable relative paths.

    Returns
    -------
    List[Asset]
        Metadata for each extracted image.
    """
    _ensure_dir(out_dir)
    assets: List[Asset] = []

    with fitz.open(pdf_path) as doc:
        for page_index in range(len(doc)):
            page = doc[page_index]
            # Each tuple in get_images() describes an embedded image
            for _, xref, *_ in page.get_images(full=True):
                try:
                    base = doc.extract_image(xref)
                    raw_bytes = base["image"]

                    # Normalize to PNG
                    img = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")
                    buf = io.BytesIO()
                    img.save(buf, format="PNG")
                    data = buf.getvalue()
                    width, height = img.size

                    # File bookkeeping
                    asset_id = str(uuid.uuid4())
                    filename = f"{asset_id}.png"

                    # rel_path relative to repo root; adjust if your server mounts differently
                    rel_path = os.path.join(
                        "data", "uploads", upload_id, "assets", filename
                    ).replace("\\", "/")
                    abs_path = os.path.abspath(rel_path)

                    _ensure_dir(os.path.dirname(abs_path))
                    with open(abs_path, "wb") as f:
                        f.write(data)

                    assets.append(
                        Asset(
                            id=asset_id,
                            upload_id=upload_id,
                            filename=filename,
                            rel_path=rel_path,
                            width=width,
                            height=height,
                            ext="png",
                            checksum=_sha256_bytes(data),
                            bbox=None,   # reserved for pdffigures2 upgrade
                            caption=None,
                            tags=[],
                        )
                    )
                except Exception:
                    # Skip corrupt or unsupported images; continue extracting others
                    continue

    return assets


# ────────────────────────────────────────────────────────────────────────────────
# Text extraction
# ────────────────────────────────────────────────────────────────────────────────

def _read_pdf(path: Path) -> Tuple[str, int]:
    # Lazy import keeps startup lighter if PDF parsing isn't used
    import pdfplumber

    with span("read_pdf", file=str(path)):
        text_parts: List[str] = []
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
            text, _ = _read_docx(path)
            kind = "docx"
        else:
            with span("read_text", file=str(path)):
                # Best-effort text read for plain files
                text = path.read_text(errors="ignore")
            kind = "text"

        text = (text or "").strip()
        # ParsedPreview's validator derives preview/length if not provided,
        # but we provide them explicitly for clarity and to avoid extra work.
        return ParsedPreview(
            kind=kind,
            pages=pages,
            text=text,
            text_length=len(text),
            text_preview=text[:1000],
        )
