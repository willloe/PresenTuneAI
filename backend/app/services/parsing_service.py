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

# NEW: GROBID integration deps
import requests
import xml.etree.ElementTree as ET

# Try to read runtime settings if available; fall back to env
try:
    from app.core.config import settings  # type: ignore
except Exception:  # pragma: no cover - keep soft dependency
    settings = None  # type: ignore

from app.core.telemetry import span
from app.models.schemas.assets import Asset
from app.models.schemas.upload import ParsedPreview


# ────────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────────

def _ensure_dir(path: str | Path) -> None:
    os.makedirs(str(path), exist_ok=True)

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

def _to_dict(obj):
    # Pydantic v2
    if hasattr(obj, "model_dump") and callable(getattr(obj, "model_dump")):
        return obj.model_dump()
    # Pydantic v1
    if hasattr(obj, "dict") and callable(getattr(obj, "dict")):
        return obj.dict()
    # Fallback
    if hasattr(obj, "__dict__"):
        return dict(obj.__dict__)
    return obj

def _write_json(path: Path, data) -> None:
    _ensure_dir(path.parent)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def _append_note(path: Path, note: str) -> None:
    try:
        with path.open("a", encoding="utf-8") as f:
            f.write(note + "\n")
    except Exception:
        pass


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

                part = rel.target_part
                data: bytes = part.blob
                # ext from part name or content-type
                ext = Path(str(part.partname)).suffix.lower().lstrip(".")
                if not ext:
                    guessed = (mimetypes.guess_extension(getattr(part, "content_type", "") or "") or "").lstrip(".")
                    ext = (guessed or "bin").lower()
                if ext == "jpeg":
                    ext = "jpg"

                # dimensions (best-effort; EMF/WMF/SVG may fail)
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
                    tags=["docx-rel"],
                ))
            except Exception:
                continue
    except Exception:
        # fall through to zip scan
        pass

    # ── Pass 2: fallback ZIP scan of word/media if nothing found
    if not assets:
        try:
            with zipfile.ZipFile(str(src), "r") as z:
                for name in z.namelist():
                    lower = name.lower()
                    if not lower.startswith("word/media/"):
                        continue
                    try:
                        data = z.read(name)
                    except Exception:
                        continue

                    ext = Path(lower).suffix.lstrip(".")
                    if ext == "jpeg":
                        ext = "jpg"
                    if not ext:
                        guessed = (mimetypes.guess_extension(name) or "").lstrip(".")
                        ext = (guessed or "bin").lower()

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
                        width=w, height=h,
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
                    xref = img[0]
                    try:
                        pix = fitz.Pixmap(doc, xref)
                        # Normalize to RGB if needed
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
    return os.environ.get("PDFFIGURES2_BIN") or shutil.which("pdffigures2")

def _parse_pdffigures2_json_meta(json_path: Path) -> Dict[str, Dict]:
    info: Dict[str, Dict] = {}
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            return info
        for fig in data:
            render = fig.get("renderURL") or fig.get("renderUrl") or fig.get("renderUri") or fig.get("imageURL")
            name = Path(render).name if isinstance(render, str) else None
            cap = fig.get("caption") or fig.get("figCaption") or fig.get("captionText")
            if isinstance(cap, dict):
                caption = cap.get("text") or cap.get("raw") or None
            else:
                caption = str(cap).strip() if cap else None
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
# NEW: GROBID helpers
# ────────────────────────────────────────────────────────────────────────────────

def _cfg_grobid() -> tuple[bool, str, int]:
    """
    Returns (enabled, base_url, timeout_seconds).
    Reads from settings if present; otherwise from environment variables.
    """
    def _get(name: str, default: Optional[str] = None) -> Optional[str]:
        if settings and hasattr(settings, name):
            return str(getattr(settings, name))
        return os.getenv(name, default)

    enabled_raw = _get("GROBID_ENABLED", "false").strip().lower()
    enabled = enabled_raw in ("1", "true", "yes", "on")
    base_url = (_get("GROBID_URL", "http://localhost:8070") or "").rstrip("/")
    try:
        timeout = int(_get("GROBID_TIMEOUT", "30") or "30")
    except Exception:
        timeout = 30
    return enabled, base_url, timeout

def _tei_to_text(tei_xml: str) -> Dict[str, str]:
    """
    Convert TEI XML → flattened text strings.
    Returns a dict with keys: title, abstract, body, full_text
    """
    ns = {"tei": "http://www.tei-c.org/ns/1.0"}
    try:
        root = ET.fromstring(tei_xml.encode("utf-8"))
    except Exception:
        # If parse fails, just return raw fallback
        return {"title": "", "abstract": "", "body": "", "full_text": ""}

    def _text(xpath: str) -> str:
        parts: List[str] = []
        for node in root.findall(xpath, ns):
            parts.append(" ".join("".join(node.itertext()).split()))
        return "\n".join([p for p in parts if p])

    title = _text(".//tei:fileDesc/tei:titleStmt/tei:title")
    abstract = _text(".//tei:profileDesc/tei:abstract//tei:p")
    # Collect body paragraphs and figure/table captions as plain text
    body_paras = _text(".//tei:text/tei:body//tei:p")
    body_heads = _text(".//tei:text/tei:body//tei:head")
    body = "\n".join([s for s in (body_heads, body_paras) if s])

    full_text = "\n\n".join([s for s in (title, abstract, body) if s])
    return {"title": title, "abstract": abstract, "body": body, "full_text": full_text}

def _tei_page_count(tei_xml: str) -> int:
    """
    Count pages from TEI page break tags (<pb/>). Fallback to 0.
    """
    ns = {"tei": "http://www.tei-c.org/ns/1.0"}
    try:
        root = ET.fromstring(tei_xml.encode("utf-8"))
        return len(root.findall(".//tei:pb", ns))
    except Exception:
        return 0

def _count_pdf_pages(path: Path) -> int:
    try:
        with fitz.open(str(path)) as doc:
            return doc.page_count
    except Exception:
        return 0

def _read_pdf_grobid(path: Path) -> Tuple[str, int, Optional[str], Optional[Dict]]:
    """
    Run PDF through GROBID and return (text, pages, tei_xml, meta_dict).
    - text: flattened from TEI
    - pages: from TEI <pb/> count or MuPDF fallback
    - tei_xml: persisted later for downstream use
    - meta_dict: minimal metadata for debugging/observability
    Raises on request issues so caller can fallback.
    """
    enabled, base_url, timeout = _cfg_grobid()
    if not enabled:
        raise RuntimeError("GROBID_DISABLED")

    url = f"{base_url}/api/processFulltextDocument"
    files = {"input": (path.name, open(path, "rb"), "application/pdf")}
    data = {
        # Keep processing lean; turn on coordinates if you plan downstream mapping
        "consolidateHeader": "0",
        "consolidateCitations": "0",
        "includeRawCitations": "0",
        "teiCoordinates": "true",
    }
    with span("grobid_request", endpoint=url, timeout_s=timeout):
        resp = requests.post(url, files=files, data=data, timeout=timeout)
    resp.raise_for_status()

    tei_xml = resp.text
    pieces = _tei_to_text(tei_xml)
    pages = _tei_page_count(tei_xml) or _count_pdf_pages(path)
    text = (pieces.get("full_text") or "").strip()

    meta = {
        "title": pieces.get("title") or "",
        "has_abstract": bool(pieces.get("abstract")),
        "body_chars": len(pieces.get("body") or ""),
        "tei_size_bytes": len(tei_xml.encode("utf-8")),
    }
    return text, pages, tei_xml, meta


# ────────────────────────────────────────────────────────────────────────────────
# Public: Unified extraction (persists assets.json)
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
    Also writes data/uploads/<upload_id>/assets.json (deduped).
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

    final_assets = found
    if dedup:
        unique: Dict[str, Asset] = {}
        for a in found:
            key = a.checksum or f"{a.width}x{a.height}:{a.filename}"
            if key not in unique:
                unique[key] = a
        final_assets = list(unique.values())

    # Persist: assets.json at upload root
    try:
        upload_root = Path(out_dir).resolve().parent  # .../uploads/<upload_id>
        _write_json(upload_root / "assets.json", [_to_dict(a) for a in final_assets])
        _append_note(upload_root / "README.txt", "Assets metadata written to assets.json")
    except Exception:
        pass

    return final_assets


# ────────────────────────────────────────────────────────────────────────────────
# Text extraction (+ persistence to parsed_preview.json & parsed.json)
# ────────────────────────────────────────────────────────────────────────────────

def _read_pdf_pdfplumber(path: Path) -> Tuple[str, int]:
    import pdfplumber
    with span("read_pdf_pdfplumber", file=str(path)):
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

def parse_file(
    path: Path,
    content_type: str | None,
    *,
    upload_root: str | Path | None = None,
) -> ParsedPreview:
    """
    Parse file and persist:
      - parsed_preview.json (lightweight preview; **no full text**)
      - parsed.json (FULL text embedded in JSON)
      - tei.xml (if GROBID used)
      - grobid_meta.json (small metadata for debugging)
    Files are written into data/uploads/<upload_id>/ when upload_root is provided.
    """
    with span("parse_file", file=str(path), content_type=content_type or "unknown"):
        path = Path(path)
        ext = path.suffix.lower()
        text, pages = "", 0
        kind = "text"

        if (content_type and "pdf" in content_type) or ext == ".pdf":
            kind = "pdf"
            # Try GROBID first, then fallback to pdfplumber
            try:
                with span("read_pdf_grobid", file=str(path)):
                    g_text, g_pages, tei_xml, grobid_meta = _read_pdf_grobid(path)
                text = g_text or ""
                pages = g_pages
            except Exception as _grobid_err:
                with span("read_pdf_pdfplumber_fallback", error=str(_grobid_err)):
                    text, pages = _read_pdf_pdfplumber(path)

        elif (content_type and "word" in content_type) or ext in {".docx"}:
            kind = "docx"
            text, _ = _read_docx(path)

        else:
            with span("read_text", file=str(path)):
                try:
                    text = path.read_text(errors="ignore")
                except Exception:
                    text = ""
            kind = "text"

        text = (text or "").strip()
        preview = ParsedPreview(
            kind=kind,
            pages=pages,
            text=text,
            text_length=len(text),
            text_preview=text[:1000]
        )

        # Determine upload root (…/uploads/<id>)
        root_dir: Optional[Path] = Path(upload_root).resolve() if upload_root else None
        if root_dir is None:
            for parent in path.resolve().parents:
                if parent.name and parent.parent and parent.parent.name == "uploads":
                    root_dir = parent
                    break

        # Persist artifacts
        try:
            if root_dir:
                # Lightweight preview file (no full text)
                preview_payload = {
                    "kind": preview.kind,
                    "pages": preview.pages,
                    "text_preview": preview.text_preview,
                    "text_length": preview.text_length,
                }
                _write_json(root_dir / "parsed_preview.json", preview_payload)

                # Full parsed text (embed entire text)
                full_payload = {
                    "kind": preview.kind,
                    "pages": preview.pages,
                    "text": text,
                    "text_length": preview.text_length
                }
                _write_json(root_dir / "parsed.json", full_payload)

                # If GROBID was used, we saved tei in local scope; write if present
                # NOTE: if fallback used, these won't exist
                try:
                    # Close over last GROBID results if still in scope
                    if 'tei_xml' in locals() and tei_xml:
                        (root_dir / "tei.xml").write_text(tei_xml, encoding="utf-8")
                    if 'grobid_meta' in locals() and grobid_meta:
                        _write_json(root_dir / "grobid_meta.json", grobid_meta)
                except Exception:
                    pass

        except Exception:
            # Non-fatal; preserve existing behavior
            pass

        return preview
