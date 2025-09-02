from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional, Tuple

import hashlib
import io
import json
import os
import shutil
import subprocess
import uuid
import zipfile

import fitz  # PyMuPDF
from PIL import Image
from docx import Document
import mimetypes
from docx.opc.constants import RELATIONSHIP_TYPE as RT

from app.core.telemetry import span
from app.models.schemas.assets import Asset
from app.models.schemas.upload import ParsedPreview


# ────────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────────

def _ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)

def _sha256_bytes(b: bytes) -> str:
    h = hashlib.sha256(); h.update(b); return h.hexdigest()

def _write_bytes(out_dir: str, upload_id: str, data: bytes, ext: str) -> Tuple[str, str]:
    """
    Write bytes into `out_dir` as a UUID filename with `ext`.
    Returns (final_name, rel_path) where rel_path is data/uploads/<upload_id>/assets/<final_name>
    """
    asset_id = str(uuid.uuid4())
    final_name = f"{asset_id}.{ext}"
    abs_path = os.path.join(out_dir, final_name)
    _ensure_dir(os.path.dirname(abs_path))
    with open(abs_path, "wb") as f:
        f.write(data)
    rel_path = str(Path("data") / "uploads" / upload_id / "assets" / final_name).replace("\\", "/")
    return final_name, rel_path


# ────────────────────────────────────────────────────────────────────────────────
# DOCX images (word/media/*)
# ────────────────────────────────────────────────────────────────────────────────

def _extract_docx_images(src: Path, out_dir: str, upload_id: str) -> List[Asset]:
    """
    Extract embedded images from a DOCX using relationship parts (python-docx),
    which is more robust than only scanning word/media/*. Falls back to a zip
    scan if nothing is found. Preserves original format when possible.
    """
    assets: List[Asset] = []

    # ── Pass 1: relationship-driven (preferred)
    try:
        doc = Document(str(src))
        for rel in list(doc.part.rels.values()):
            try:
                if rel.reltype != RT.IMAGE:
                    continue

                part = rel.target_part                       # image part
                data: bytes = part.blob                      # raw bytes
                # ext from part name or content-type
                ext = Path(str(part.partname)).suffix.lower().lstrip(".")
                if not ext:
                    guessed = (mimetypes.guess_extension(getattr(part, "content_type", "") or "") or "").lstrip(".")
                    ext = (guessed or "bin").lower()
                if ext == "jpeg":
                    ext = "jpg"

                # Try to read dimensions
                w = h = 0
                try:
                    with Image.open(io.BytesIO(data)) as im:
                        w, h = im.size
                except Exception:
                    # If Pillow can't read (e.g., EMF/WMF/SVG), keep dims 0
                    pass

                final_name, rel_path = _write_bytes(out_dir, upload_id, data, ext)
                assets.append(Asset(
                    id=Path(final_name).stem,
                    upload_id=upload_id,
                    filename=final_name,
                    rel_path=rel_path,
                    width=w,
                    height=h,
                    ext=ext,
                    checksum=_sha256_bytes(data),
                    bbox=None,
                    caption=None,
                    tags=["docx-rel"],
                ))
            except Exception:
                continue
    except Exception:
        # If python-docx fails to load, we’ll try the zip fallback next
        pass

    # ── Pass 2: fallback ZIP scan of word/media if nothing found
    if not assets:
        try:
            with zipfile.ZipFile(str(src), "r") as z:
                for name in z.namelist():
                    lower = name.lower()
                    if not lower.startswith("word/media/"):
                        continue

                    # pull any file in media (don’t over-filter extensions)
                    try:
                        data = z.read(name)
                    except Exception:
                        continue

                    # ext by filename; normalize
                    ext = Path(lower).suffix.lstrip(".")
                    if ext == "jpeg":
                        ext = "jpg"
                    if not ext:
                        # last-ditch: guess by sniffing
                        guessed = (mimetypes.guess_extension(name) or "").lstrip(".")
                        ext = (guessed or "bin").lower()

                    # Try to read dimensions
                    w = h = 0
                    try:
                        with Image.open(io.BytesIO(data)) as im:
                            w, h = im.size
                    except Exception:
                        pass

                    final_name, rel_path = _write_bytes(out_dir, upload_id, data, ext)
                    assets.append(Asset(
                        id=Path(final_name).stem,
                        upload_id=upload_id,
                        filename=final_name,
                        rel_path=rel_path,
                        width=w,
                        height=h,
                        ext=ext,
                        checksum=_sha256_bytes(data),
                        bbox=None,
                        caption=None,
                        tags=["docx-zip"],
                    ))
        except Exception:
            pass

    return assets


# ────────────────────────────────────────────────────────────────────────────────
# PDF raster images (MuPDF)
# ────────────────────────────────────────────────────────────────────────────────

def _extract_pdf_images_mupdf(src: Path, out_dir: str, upload_id: str) -> List[Asset]:
    assets: List[Asset] = []
    try:
        with fitz.open(str(src)) as doc:
            for page in doc:
                for img in page.get_images(full=True):
                    xref = img[0]  # (xref, smask, w, h, bpc, colorspace, ..., filter)
                    try:
                        pix = fitz.Pixmap(doc, xref)
                        # Convert CMYK/gray/with-alpha to RGB to ensure PNG is fine
                        if pix.n > 4 or pix.alpha:
                            pix = fitz.Pixmap(fitz.csRGB, pix)
                        data = pix.tobytes("png")
                        w, h = pix.width, pix.height

                        final_name, rel_path = _write_bytes(out_dir, upload_id, data, "png")
                        assets.append(Asset(
                            id=Path(final_name).stem,
                            upload_id=upload_id,
                            filename=final_name,
                            rel_path=rel_path,
                            width=w, height=h, ext="png",
                            checksum=_sha256_bytes(data),
                            bbox=None, caption=None, tags=[],
                        ))
                    except Exception:
                        continue
                    finally:
                        try:
                            pix = None
                        except Exception:
                            pass
    except Exception:
        pass
    return assets


# ────────────────────────────────────────────────────────────────────────────────
# PDF scientific figures (pdffigures2)
# ────────────────────────────────────────────────────────────────────────────────

def _which_pdffigures2() -> Optional[str]:
    # prefer explicit env var; else search PATH
    return os.environ.get("PDFFIGURES2_BIN") or shutil.which("pdffigures2")

def _parse_pdffigures2_json_meta(json_path: Path) -> Dict[str, Dict]:
    """
    Parse <base>.json from pdffigures2 and map figure image filename -> {caption, bbox}.
    Be liberal with schema: handle caption as dict or string, and different region keys.
    """
    info: Dict[str, Dict] = {}
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            return info
        for fig in data:
            # filename
            render = fig.get("renderURL") or fig.get("renderUrl") or fig.get("renderUri") or fig.get("imageURL")
            name = None
            if isinstance(render, str):
                name = Path(render).name
            # caption
            cap = fig.get("caption") or fig.get("figCaption") or fig.get("captionText")
            if isinstance(cap, dict):
                caption = cap.get("text") or cap.get("raw") or None
            else:
                caption = str(cap).strip() if cap else None
            # bbox
            reg = fig.get("region") or fig.get("figureRegion") or fig.get("regionBoundary") or {}
            try:
                x1 = float(reg.get("x1", 0)); y1 = float(reg.get("y1", 0))
                x2 = float(reg.get("x2", 0)); y2 = float(reg.get("y2", 0))
                bbox = [x1, y1, max(0.0, x2 - x1), max(0.0, y2 - y1)]
            except Exception:
                bbox = None
            if name:
                info[name] = {"caption": (caption.strip() if isinstance(caption, str) else caption) or None,
                              "bbox": bbox}
    except Exception:
        pass
    return info

def _extract_pdf_figures_pdffigures2(src: Path, out_dir: str, upload_id: str) -> List[Asset]:
    assets: List[Asset] = []
    bin_path = _which_pdffigures2()
    if not bin_path:
        return assets

    out_dir_slash = out_dir if out_dir.endswith(os.path.sep) else out_dir + os.path.sep
    cmd = [bin_path, str(src), "-d", out_dir_slash]

    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, text=True)
    except Exception:
        return assets

    base = src.stem
    meta_map: Dict[str, Dict] = {}
    json_path = Path(out_dir) / f"{base}.json"
    if json_path.exists():
        meta_map = _parse_pdffigures2_json_meta(json_path)

    for p in Path(out_dir).glob(f"{base}-fig*.png"):
        try:
            with Image.open(p) as im:
                w, h = im.size
            data = p.read_bytes()

            fig_meta = meta_map.get(p.name, {})
            caption = fig_meta.get("caption")
            bbox = fig_meta.get("bbox")

            final_name, rel_path = _write_bytes(out_dir, upload_id, data, "png")
            assets.append(Asset(
                id=Path(final_name).stem,
                upload_id=upload_id,
                filename=final_name,
                rel_path=rel_path,
                width=w, height=h, ext="png",
                checksum=_sha256_bytes(data),
                bbox=bbox, caption=caption, tags=["pdffigures2"],
            ))
        except Exception:
            continue

    return assets


# ────────────────────────────────────────────────────────────────────────────────
# Public: Unified extraction
# ────────────────────────────────────────────────────────────────────────────────

def extract_images(
    file_path: str,
    out_dir: str,
    upload_id: str,
    *,
    use_pdffigures2: bool = True,
    dedup: bool = True,
) -> List[Asset]:
    """
    - .docx → images from word/media/*
    - .pdf  → MuPDF rasters (+ pdffigures2 figures if enabled)
    """
    src = Path(file_path)
    suffix = src.suffix.lower()
    _ensure_dir(out_dir)

    found: List[Asset] = []
    if suffix == ".docx":
        with span("extract_docx_images", file=str(src)):
            found.extend(_extract_docx_images(src, out_dir, upload_id))
    elif suffix == ".pdf":
        with span("extract_pdf_images_mupdf", file=str(src)):
            found.extend(_extract_pdf_images_mupdf(src, out_dir, upload_id))
        if use_pdffigures2:
            with span("extract_pdf_figures_pdffigures2", file=str(src)):
                found.extend(_extract_pdf_figures_pdffigures2(src, out_dir, upload_id))
    else:
        return []

    if not dedup:
        return found

    unique: Dict[str, Asset] = {}
    for a in found:
        key = a.checksum or f"{a.width}x{a.height}:{a.filename}"
        if key not in unique:
            unique[key] = a
    return list(unique.values())


# ────────────────────────────────────────────────────────────────────────────────
# Text extraction (unchanged)
# ────────────────────────────────────────────────────────────────────────────────

def _read_pdf(path: Path) -> Tuple[str, int]:
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
        return text, 0

def parse_file(path: Path, content_type: str | None) -> ParsedPreview:
    with span("parse_file", file=str(path), content_type=content_type or "unknown"):
        path = Path(path)
        ext = path.suffix.lower()
        text, pages = "", 0

        if (content_type and "pdf" in content_type) or ext == ".pdf":
            text, pages = _read_pdf(path); kind = "pdf"
        elif (content_type and "word" in content_type) or ext in {".docx"}:
            text, _ = _read_docx(path); kind = "docx"
        else:
            with span("read_text", file=str(path)):
                text = path.read_text(errors="ignore"); kind = "text"

        text = (text or "").strip()
        return ParsedPreview(kind=kind, pages=pages, text=text,
                             text_length=len(text), text_preview=text[:1000])
