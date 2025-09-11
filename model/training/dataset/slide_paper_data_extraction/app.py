import json
import os
import tempfile
from typing import Dict, List, Any, Tuple, Optional

from flask import Flask, request, redirect, url_for, send_from_directory, abort, Response, jsonify
import unicodedata
import re
import math
import functools
import requests
import time
from threading import Lock, Thread
from concurrent.futures import ThreadPoolExecutor, as_completed


app = Flask(__name__)

# ----------------------------
# LLM cleanup configuration
# ----------------------------
# Defaults to Groq's OSS model; override via env LLM_MODEL
LLM_PRIMARY = os.environ.get("LLM_MODEL", "openai/gpt-oss-20b")
# Disable fallback by default (use only 20B). Set env LLM_FALLBACK_MODEL to enable.
LLM_FALLBACK = os.environ.get("LLM_FALLBACK_MODEL", "")
try:
    LLM_TIMEOUT_S = float(os.environ.get("LLM_TIMEOUT_S", "30"))
except Exception:
    LLM_TIMEOUT_S = 30.0
try:
    LLM_RETRIES = int(os.environ.get("LLM_RETRIES", "2"))
except Exception:
    LLM_RETRIES = 2

# ----------------------------
# LLM concurrency
# ----------------------------
try:
    LLM_CONCURRENCY = int(os.environ.get("LLM_CONCURRENCY", "6"))
except Exception:
    LLM_CONCURRENCY = 6

# ----------------------------
# Deduplication configuration
# ----------------------------
try:
    DEDUPE_THRESHOLD_DEFAULT = float(os.environ.get("DEDUPE_THRESHOLD", "0.9"))
except Exception:
    DEDUPE_THRESHOLD_DEFAULT = 0.9

# ----------------------------
# Paths
# ----------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_JSON_DIR = os.path.join(BASE_DIR, "out_json")
DATA_RAW_DIR = os.path.join(BASE_DIR, "data_raw")
DONE_STATUS_FILE = os.path.join(BASE_DIR, "done_status.json")

# ----------------------------
# OCR All progress (in-memory)
# ----------------------------
OCR_PROGRESS: Dict[str, Dict[str, Any]] = {}
OCR_LOCK = Lock()

# Batch progress state
BATCH_PROGRESS: Dict[str, Any] = {"running": False}
BATCH_THREAD: Any = None
BATCH_LOCK = Lock()

# Single-entry workers (per conf/idd)
SINGLE_WORKERS: Dict[str, Thread] = {}


def _progress_key(conf: str, idd: int) -> str:
    return f"{conf}/{idd}"


def _set_progress(conf: str, idd: int, **fields):
    key = _progress_key(conf, idd)
    with OCR_LOCK:
        base = OCR_PROGRESS.get(key, {"phase": "starting", "current": 0, "total": 0})
        base.update(fields)
        OCR_PROGRESS[key] = base


def _set_batch(**fields):
    with BATCH_LOCK:
        base = BATCH_PROGRESS if BATCH_PROGRESS else {"running": False}
        base.update(fields)
        BATCH_PROGRESS.update(base)


def _get_batch() -> Dict[str, Any]:
    with BATCH_LOCK:
        return dict(BATCH_PROGRESS)


# ----------------------------
# Done status
# ----------------------------
def read_done_status() -> set:
    if not os.path.exists(DONE_STATUS_FILE):
        return set()
    try:
        with open(DONE_STATUS_FILE, "r", encoding="utf-8") as f:
            return set(json.load(f))
    except (json.JSONDecodeError, IOError):
        return set()

def write_done_status(done_set: set) -> None:
    with open(DONE_STATUS_FILE, "w", encoding="utf-8") as f:
        json.dump(sorted(list(done_set)), f, indent=2)


# ----------------------------
# HTML helpers
# ----------------------------
def html_escape(text: str) -> str:
    if text is None:
        return ""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#x27;")
    )


# ----------------------------
# OCR text normalization
# ----------------------------
def normalize_ocr_text(raw_text: str) -> str:
    if raw_text is None:
        return ""
    text = unicodedata.normalize("NFKC", raw_text)
    replacements = {
        "•": "- ", "·": "- ", "●": "- ", "◦": "- ", "": "- ", "": "- ", "¢": "- ",
        "–": "-", "—": "-", "-": "-", "‒": "-", "−": "-",
        "“": '"', "”": '"', "„": '"', "‟": '"', "’": "'", "‘": "'",
        "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl",
        "…": "...",
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    text = re.sub(r"[\u0000-\u001F\u007F]", "", text)
    text = re.sub(r"-\s*\n\s*", "", text)  # fix struc-\n ture -> structure
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t\f\v]+", " ", text)
    return text


def smart_linebreaks(s: str, width: int = 120) -> str:
    """Insert reasonable newlines for bullets/numbered lists and wrap long lines."""
    if not s:
        return s
    s = re.sub(r"[ \t]*\n[ \t]*", "\n", s)

    # Newline before bullets that appear mid-line
    s = re.sub(r"(?<!^)\s+(?=-\s+)", "\n", s)

    # Newline before simple numbered bullets (1., 2.) or a), b)
    s = re.sub(r"(?<!^)\s+(?=(?:\d+[\.\)]|[A-Za-z]\))\s+)", "\n", s)

    # Soft wrap long lines at sentence boundaries first, then spaces
    out_lines = []
    for line in s.split("\n"):
        line = line.strip()
        if len(line) <= width:
            out_lines.append(line)
            continue
        parts = re.split(r"(?<=[\.\!\?])\s+", line)
        buf = ""
        for p in parts:
            if not p:
                continue
            if buf and len(buf) + 1 + len(p) > width:
                out_lines.append(buf)
                buf = p
            else:
                buf = (buf + " " + p).strip() if buf else p
        if buf:
            out_lines.append(buf)
    t = "\n".join(out_lines)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


# ----------------------------
# LLM utilities
# ----------------------------
def _llm_enabled() -> bool:
    # Support either OpenAI or Groq (OpenAI-compatible) credentials
    return bool(os.environ.get("OPENAI_API_KEY") or os.environ.get("GROQ_API_KEY"))

def clean_with_llm(text: str) -> str:
    """Clean OCR text using LLM. Hard-require LLM: raise if disabled or empty output."""
    if not (text and text.strip()):
        return ""

    if not _llm_enabled():
        # Hard fail: we are not allowed to return text without LLM
        raise RuntimeError("LLM is required but not enabled (missing OPENAI_API_KEY).")

    try:
        # Prefer Groq if GROQ_API_KEY is present; otherwise use OpenAI (or any custom OPENAI_BASE_URL)
        using_groq = bool(os.environ.get("GROQ_API_KEY")) or "groq.com" in str(os.environ.get("OPENAI_BASE_URL", ""))
        api_key = (os.environ.get("GROQ_API_KEY") if using_groq else os.environ.get("OPENAI_API_KEY")) or ""
        # Choose base URL by provider; do NOT let OPENAI_BASE_URL override when using Groq
        if using_groq:
            base_url = os.environ.get("GROQ_BASE_URL") or "https://api.groq.com/openai/v1"
        else:
            base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")

        def _extract_between_tags(s: str, tag: str = "out") -> str:
            m = re.search(rf"<{tag}>([\s\S]*?)</{tag}>", s)
            if m:
                return (m.group(1) or "").strip()
            # Fallback: if opening tag exists but closing tag likely truncated, take content after first opening tag
            m2 = re.search(rf"<{tag}>([\s\S]*)$", s)
            if m2:
                return (m2.group(1) or "").strip()
            return ""

        system_msg = (
            "You are a precise OCR text cleaner.\n"
            "Rules:\n"
            "- Preserve existing blank lines when they make sense.\n"
            "- Fix broken words across line breaks (e.g., 'struc-\\n ture' -> 'structure').\n"
            "- Normalize quotes/dashes and convert bullets to '- '.\n"
            "- Insert a newline before each bullet or numbered item.\n"
            "- Remove extra spaces and obvious OCR artifacts.\n"
            "- Do NOT add new content.\n"
            "Return ONLY the cleaned text wrapped in <out>...</out>."
        )
        user_msg = f"Clean this OCR text and return only <out>...</out>:\n<in>\n{text}\n</in>"
        # Allocate generous output tokens for Groq to avoid early truncation
        if bool(os.environ.get("GROQ_API_KEY")) or "groq.com" in str(os.environ.get("OPENAI_BASE_URL", "")):
            visible_target = 8192
        else:
            visible_target = min(4096, max(1024, len(text) + 512))
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

        def _chat_call(model: str):
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": user_msg},
                ],
                # Use max_tokens for OpenAI-compatible providers (Groq supports this)
                "max_tokens": visible_target,
                "temperature": 0,
            }
            r = requests.post(f"{base_url}/chat/completions", json=payload, headers=headers, timeout=LLM_TIMEOUT_S)
            if r.status_code != 200:
                try:
                    print(f"[LLM chat {model}] http {r.status_code}: {r.text[:300]}")
                except Exception:
                    pass
                return None
            data = r.json()
            msg = (((data.get("choices") or [{}])[0]).get("message") or {}).get("content") or ""
            out = _extract_between_tags(msg, "out") or (msg or "").strip()
            usage = data.get("usage", {})
            details = (usage.get("completion_tokens_details") or {})
            print(f"[LLM chat {model} via {'groq' if using_groq else 'openai'}] out_len={len(out)} reason_tokens={details.get('reasoning_tokens')} finish={((data.get('choices') or [{}])[0]).get('finish_reason')}")
            return (out or "").strip()

        # Track last used model for stats in ocr_all / workers
        setattr(clean_with_llm, "last_used_model", None)

        # Primary + retries
        cleaned = _chat_call(LLM_PRIMARY)
        tries = 0
        while (not cleaned) and (tries < LLM_RETRIES):
            tries += 1
            cleaned = _chat_call(LLM_PRIMARY)

        if cleaned:
            setattr(clean_with_llm, "last_used_model", LLM_PRIMARY)
            return smart_linebreaks(cleaned)

        # Fallback
        if LLM_FALLBACK and LLM_FALLBACK != LLM_PRIMARY:
            print(f"[LLM] falling back to {LLM_FALLBACK}")
            cleaned = _chat_call(LLM_FALLBACK)
            if cleaned:
                setattr(clean_with_llm, "last_used_model", LLM_FALLBACK)
                return smart_linebreaks(cleaned)

        # Hard fail to respect strict LLM requirement
        raise RuntimeError("LLM returned no output after retries/fallback.")

    except Exception as e:
        # Propagate the failure; callers must respect that LLM is required
        raise


# ----------------------------
# OCR engines
# ----------------------------
_paddle_ocr_instance = None

def get_paddle_ocr():
    global _paddle_ocr_instance
    if _paddle_ocr_instance is not None:
        return _paddle_ocr_instance
    try:
        from paddleocr import PaddleOCR  # type: ignore
    except Exception:
        return None
    use_gpu = str(os.environ.get("PADDLE_USE_GPU", "0")).lower() in {"1", "true", "yes"}
    try:
        _paddle_ocr_instance = PaddleOCR(use_textline_orientation=True, lang="en", use_gpu=use_gpu, show_log=False)
        return _paddle_ocr_instance
    except Exception:
        return None

def ocr_extract_text(image_path: str) -> str:
    # Prefer PaddleOCR if available
    ocr = get_paddle_ocr()
    if ocr is not None:
        try:
            result = ocr.ocr(image_path, cls=True)
            # Collect boxes: (center_y, min_x, height, text, conf)
            boxes: List[tuple] = []
            heights: List[float] = []
            for page in result or []:
                for det in page or []:
                    try:
                        quad = det[0] or []
                        xs = [p[0] for p in quad]
                        ys = [p[1] for p in quad]
                        if not xs or not ys:
                            continue
                        min_x = float(min(xs))
                        min_y = float(min(ys))
                        max_y = float(max(ys))
                        center_y = (min_y + max_y) / 2.0
                        height = max(1.0, max_y - min_y)
                        txt = det[1][0]
                        conf = float(det[1][1]) if det[1][1] is not None else 0.0
                        if conf < 0.30:
                            continue
                        boxes.append((center_y, min_x, height, txt, conf))
                        heights.append(height)
                    except Exception:
                        continue
            if not boxes:
                return ""
            heights.sort()
            med_h = heights[len(heights)//2] if heights else 12.0
            tol = max(8.0, 0.6 * med_h)
            boxes.sort(key=lambda t: t[0])  # by center_y
            lines: List[List[tuple]] = []
            line_centers: List[float] = []
            for b in boxes:
                cy = b[0]
                placed = False
                for li, lcy in enumerate(line_centers):
                    if abs(cy - lcy) <= tol:
                        lines[li].append(b)
                        line_centers[li] = (line_centers[li] * (len(lines[li])-1) + cy) / len(lines[li])
                        placed = True
                        break
                if not placed:
                    lines.append([b])
                    line_centers.append(cy)
            line_pairs = list(zip(line_centers, lines))
            line_pairs.sort(key=lambda p: p[0])
            out_lines: List[str] = []
            for _, line_items in line_pairs:
                line_items.sort(key=lambda t: t[1])  # by min_x
                texts = [it[3] for it in line_items]
                out_lines.append(" ".join(texts))
            return "\n".join(out_lines)
        except Exception:
            pass
    # Fallback to Tesseract
    try:
        from PIL import Image
        import pytesseract
        with Image.open(image_path) as im:
            return pytesseract.image_to_string(im, lang="eng", config="--oem 3 --psm 6")
    except Exception:
        return ""


def text_similarity_ratio(a: str, b: str) -> float:
    import difflib
    return difflib.SequenceMatcher(None, a, b).ratio()


def _clean_one_llm(idx: int, text: str):
    """
    Thread-safe wrapper for LLM cleanup.
    Returns: (idx, ok, cleaned_or_err, model_used_or_none)
    """
    try:
        out = clean_with_llm(text)
        model_used = getattr(clean_with_llm, "last_used_model", LLM_PRIMARY)
        return (idx, True, out, model_used)
    except Exception as e:
        return (idx, False, str(e), None)

# ----------------------------
# Presentation-level dedupe helpers
# ----------------------------
def slide_text_plain(slide: Dict[str, Any]) -> str:
    texts = slide.get("texts", [])
    try:
        merged = "\n".join(texts)
    except Exception:
        merged = ""
    return (merged or "").replace("\\n", "\n").strip()


def dedupe_slides_in_place(slides: List[Dict[str, Any]], threshold: float) -> int:
    """Remove near-duplicate slides in-place, keeping first occurrences.
    Returns the number of removed slides.
    """
    if not isinstance(slides, list):
        return 0
    kept_slides: List[Dict[str, Any]] = []
    kept_texts: List[str] = []
    removed_count = 0
    for s in slides:
        t = slide_text_plain(s)
        if t:
            # If very similar to any kept slide, drop this one
            is_dup = any(text_similarity_ratio(t, kt) >= threshold for kt in kept_texts if kt)
            if is_dup:
                removed_count += 1
                continue
        kept_slides.append(s)
        kept_texts.append(t)
    if removed_count:
        slides[:] = kept_slides
    return removed_count


# ----------------------------
# JSON/entries helpers
# ----------------------------
def load_conf_path(conf: str) -> str:
    path = os.path.join(OUT_JSON_DIR, f"{conf}.json")
    if not os.path.isfile(path):
        abort(404, description=f"JSON file not found for conf '{conf}'")
    return path

def read_conf_entries(conf: str) -> List[Dict[str, Any]]:
    path = load_conf_path(conf)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def write_conf_entries(conf: str, entries: List[Dict[str, Any]]) -> None:
    path = load_conf_path(conf)
    fd, tmp_path = tempfile.mkstemp(prefix=f".{conf}.", suffix=".json", dir=OUT_JSON_DIR)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp_f:
            json.dump(entries, tmp_f, ensure_ascii=False, indent=2)
            tmp_f.write("\n")
        os.replace(tmp_path, path)
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass

def get_entry_by_idd(entries: List[Dict[str, Any]], idd: int) -> Dict[str, Any]:
    for e in entries:
        if int(e.get("idd")) == int(idd):
            return e
    abort(404, description=f"Entry with idd {idd} not found")

def list_available_confs() -> List[str]:
    confs: List[str] = []
    if not os.path.isdir(OUT_JSON_DIR):
        return confs
    for name in os.listdir(OUT_JSON_DIR):
        if name.endswith(".json"):
            confs.append(os.path.splitext(name)[0])
    return sorted(confs)

def list_images(conf: str, idd: int) -> List[str]:
    dir_path = os.path.join(DATA_RAW_DIR, conf, str(idd))
    if not os.path.isdir(dir_path):
        return []
    allowed = {".jpg", ".jpeg", ".png"}
    files: List[str] = []
    for name in os.listdir(dir_path):
        low = name.lower()
        _, ext = os.path.splitext(low)
        if ext in allowed:
            stem, _ = os.path.splitext(low)
            if stem == "0":
                continue  # skip cover 0.*
            files.append(name)
    def sort_key(n: str):
        s, e = os.path.splitext(n)
        try:
            return (0, int(s))
        except Exception:
            return (1, s)
    files.sort(key=sort_key)
    return files


# ----------------------------
# Routes
# ----------------------------
@app.get("/")
def index() -> str:
    confs = list_available_confs()
    done_set = read_done_status()
    parts: List[str] = []
    parts.append("<html><head><title>Dataset Browser</title>")
    parts.append("""
    <style>
      body { font-family: Arial, sans-serif; margin: 16px; }
      .conf { margin-bottom: 16px; }
      .grid { display: grid; grid-template-columns: 1fr 3fr; gap: 8px; }
      a { text-decoration: none; color: #0645AD; }
      a:hover { text-decoration: underline; }
      .count { color: #555; font-size: 0.9em; }
      .done-check { color: green; font-weight: bold; }
      .btn { display: inline-block; padding: 8px 12px; border: 1px solid #444; background: #eee; color: #000; cursor: pointer; text-decoration: none; }
      .btn:hover { background: #e0e0e0; }
      #runAllWrap { margin: 12px 0 20px; }
      .barWrap { height: 10px; background:#eee; border-radius:5px; overflow:hidden; display:none; margin: 8px 0; }
      .bar { height:100%; width:0%; background:#4caf50; transition: width .2s linear; }
      .muted { color:#777; }

      /* mini per-entry progress bar */
      .miniBarWrap { height:6px; background:#eee; border-radius:5px; overflow:hidden; display:none; margin-top:4px; width:240px; }
      .miniBar { height:100%; width:0%; background:#4caf50; transition: width .2s linear; }
    </style>
    """)
    parts.append("</head><body>")
    parts.append("<h2>Available Presentations</h2>")
    parts.append("<div id='runAllWrap'>")
    parts.append("<button class='btn' id='runAllBtn'>Run OCR+LLM for all pending</button> ")
    parts.append("<span id='runAllStatus' class='count'></span>")
    parts.append("<div class='barWrap' id='batchBarWrap'><div class='bar' id='batchBar'></div></div>")
    parts.append("<div class='barWrap' id='entryBarWrap'><div class='bar' id='entryBar'></div></div>")
    parts.append("<div class='muted' id='batchDetail'></div>")
    parts.append("<div class='muted' id='entryDetail'></div>")
    parts.append("</div>")

    if not confs:
        parts.append("<p>No JSON files found in out_json/.</p>")
    for conf in confs:
        try:
            entries = read_conf_entries(conf)
        except Exception as e:
            parts.append(f"<div class='conf'><strong>{html_escape(conf)}</strong>: failed to read ({html_escape(e)})</div>")
            continue
        parts.append("<div class='conf'>")
        parts.append(f"<h3>{html_escape(conf)} <span class='count'>({len(entries)} presentations)</span></h3>")
        parts.append("<div class='grid'>")
        for e in entries:
            idd = e.get("idd")
            presentation_id = f"{conf}/{idd}"
            done_marker = "<span class='done-check'>✓</span>" if presentation_id in done_set else ""
            parts.append(f"<div>ID {idd} {done_marker}</div>")
            # Link + mini progress placeholders (per-entry)
            parts.append(
                f"<div>"
                f"<a href='{url_for('view_entry', conf=conf, idd=idd)}'>Open presentation {idd}</a>"
                f"<div class='miniBarWrap' id='pb_{conf}_{idd}'><div class='miniBar' id='pbb_{conf}_{idd}'></div></div>"
                f"<div class='muted' id='pbt_{conf}_{idd}'></div>"
                f"</div>"
            )
        parts.append("</div>")
        parts.append("</div>")

    parts.append("<script>")
    parts.append("(function(){\n"
                 "  var btn=document.getElementById('runAllBtn');\n"
                 "  var st=document.getElementById('runAllStatus');\n"
                 "  var bWrap=document.getElementById('batchBarWrap');\n"
                 "  var bBar=document.getElementById('batchBar');\n"
                 "  var eWrap=document.getElementById('entryBarWrap');\n"
                 "  var eBar=document.getElementById('entryBar');\n"
                 "  var bDet=document.getElementById('batchDetail');\n"
                 "  var eDet=document.getElementById('entryDetail');\n"
                 "  var pollTimer=null;\n"
                 "  var lastKey=null;\n"
                 "  function pct(n,d){ if(!d) return 0; return Math.min(100, Math.round(100*n/d)); }\n"
                 "  function hideLastPB(){\n"
                 "    if(!lastKey) return;\n"
                 "    var wrap=document.getElementById('pb_'+lastKey);\n"
                 "    var txt =document.getElementById('pbt_'+lastKey);\n"
                 "    var bar =document.getElementById('pbb_'+lastKey);\n"
                 "    if(wrap){ wrap.style.display='none'; }\n"
                 "    if(bar){ bar.style.width='0%'; }\n"
                 "    if(txt){ txt.textContent=''; }\n"
                 "    lastKey=null;\n"
                 "  }\n"
                 "  function showPB(conf, idd, ec, et, phase, file){\n"
                 "    var key = conf+'_'+idd;\n"
                 "    if(lastKey && lastKey!==key) hideLastPB();\n"
                 "    var wrap=document.getElementById('pb_'+key);\n"
                 "    var bar =document.getElementById('pbb_'+key);\n"
                 "    var txt =document.getElementById('pbt_'+key);\n"
                 "    if(wrap && bar){\n"
                 "      wrap.style.display='block';\n"
                 "      bar.style.width=pct(ec, et||1)+'%';\n"
                 "    }\n"
                 "    if(txt){\n"
                 "      txt.textContent=(phase||'working')+' '+(ec||0)+'/'+(et||0)+(file?(' — '+file):'');\n"
                 "    }\n"
                 "    lastKey=key;\n"
                 "  }\n"
                 "  function poll(){\n"
                 "    fetch('/ocr_all_pending_status').then(r=>r.json()).then(function(p){\n"
                 "      if(!p){ return; }\n"
                 "      if(bWrap) bWrap.style.display='block'; if(eWrap) eWrap.style.display='block';\n"
                 "      if(!p.running){\n"
                 "        if(p.total){ bBar.style.width='100%'; }\n"
                 "        hideLastPB();\n"
                 "        if(p.result){\n"
                 "          st.textContent = 'Done: processed '+(p.result.processed||0)+'/'+(p.result.total||0)+', added '+(p.result.added_total||0)+' slides'+(p.result.errors&&p.result.errors.length? ('; errors: '+p.result.errors.length):'');\n"
                 "        } else { st.textContent='Batch done'; }\n"
                 "        clearInterval(pollTimer);\n"
                 "        return;\n"
                 "      }\n"
                 "      var processed=p.processed||0, total=p.total||0;\n"
                 "      bBar.style.width=pct(processed,total)+'%';\n"
                 "      if(bDet){ bDet.textContent='Batch '+processed+'/'+total+(p.current_conf?(' — '+p.current_conf+'/'+p.current_idd):''); }\n"
                 "      var ec=0, et=0, phase='waiting', file='';\n"
                 "      if(p.entry){ ec=p.entry.current||0; et=p.entry.total||0; phase=p.entry.phase||phase; file=p.entry.file||''; }\n"
                 "      eBar.style.width=pct(ec, et||1)+'%';\n"
                 "      if(eDet){ eDet.textContent = (phase)+' '+ec+'/'+(et||0)+(file?(' — '+file):''); }\n"
                 "      if(p.current_conf && (p.current_idd!==undefined && p.current_idd!==null)){\n"
                 "        showPB(String(p.current_conf), String(p.current_idd), ec, et, phase, file);\n"
                 "      } else {\n"
                 "        hideLastPB();\n"
                 "      }\n"
                 "    }).catch(function(){});\n"
                 "  }\n"
                 "  if(btn){ btn.onclick=function(){ if(st){ st.textContent='Running...'; } if(bWrap) bWrap.style.display='block'; if(eWrap) eWrap.style.display='block'; pollTimer=setInterval(poll, 400); poll(); fetch('/ocr_all_pending', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ threshold: 0.9 }) }).then(r=>r.json()).then(function(res){ /* ack; polling updates UI */ }).catch(function(err){ if(st){ st.textContent='Error: '+(err && err.message? err.message : 'failed'); } clearInterval(pollTimer); }); }; }\n"
                 "})();")
    parts.append("</script>")
    parts.append("</body></html>")
    return "".join(parts)


@app.route("/view/<conf>/<int:idd>", methods=["GET", "POST"])
def view_entry(conf: str, idd: int) -> Response:
    entries = read_conf_entries(conf)
    entry = get_entry_by_idd(entries, idd)

    if request.method == "POST":
        action = request.form.get("action", "save")
        img_idx_to_keep = request.form.get('img_idx', '0')

        if action == "delete":
            new_entries = [e for e in entries if int(e.get("idd")) != int(idd)]
            write_conf_entries(conf, new_entries)
            return redirect(url_for("index"))

        if action.startswith("delete_slide_"):
            try:
                _, _, sec_idx_str, sld_idx_str = action.split("_", 3)
                sec_idx, sld_idx = int(sec_idx_str), int(sld_idx_str)
                slides = entry.get("slides", [])
                slides[:] = [
                    s for s in slides
                    if not (int(s.get("section_index")) == sec_idx and int(s.get("slide_index")) == sld_idx)
                ]
                write_conf_entries(conf, entries)
            except Exception:
                pass
            return redirect(url_for("view_entry", conf=conf, idd=idd, img_idx=img_idx_to_keep))

        slides = entry.get("slides", [])
        for slide in slides:
            idx = slide.get("slide_index")
            field_name = f"slide_{idx}"
            new_text_blob = request.form.get(field_name, None)
            if new_text_blob is not None:
                slide["texts"] = [new_text_blob.replace("\r", "").replace("\n", "\\n")]
        write_conf_entries(conf, entries)

        presentation_id = f"{conf}/{idd}"
        done_set = read_done_status()
        if action == "save_and_mark_done":
            done_set.add(presentation_id)
            write_done_status(done_set)
            return redirect(url_for("index"))
        elif action == "mark_incomplete":
            done_set.discard(presentation_id)
            write_done_status(done_set)

        return redirect(url_for("view_entry", conf=conf, idd=idd, img_idx=img_idx_to_keep))

    # GET
    slides = entry.get("slides", [])
    images = list_images(conf, idd)

    try:
        initial_img_idx = int(request.args.get('img_idx', '0'))
    except (ValueError, TypeError):
        initial_img_idx = 0
    if not (0 <= initial_img_idx < len(images)):
        initial_img_idx = 0

    done_set = read_done_status()
    is_done = f"{conf}/{idd}" in done_set

    parts: List[str] = []
    parts.append("<html><head><title>Edit Presentation</title>")
    parts.append("""
    <style>
      html, body { height: 100%; }
      body { font-family: Arial, sans-serif; margin: 0; display: flex; flex-direction: column; height: 100vh; }
      .topbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #ddd; flex-shrink: 0; }
      .layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; flex-grow: 1; overflow: hidden; }
      .left { overflow-y: auto; padding: 16px; }
      .right { padding: 16px; border-left: 1px solid #eee; display: flex; flex-direction: column; }
      .actions { margin-bottom: 12px; display: flex; gap: 8px; align-items: center;}
      .slide { margin-bottom: 16px; }
      .slide h4 { margin: 0 0 6px 0; }
      textarea { width: 100%; height: 160px; font-family: monospace; }
      img { max-width: 100%; max-height: calc(100vh - 160px); border: 1px solid #ddd; }
      .btn { display: inline-block; padding: 8px 12px; border: 1px solid #444; background: #eee; color: #000; cursor: pointer; text-decoration: none; }
      .btn:hover { background: #e0e0e0; }
      .danger { border-color: #a00; color: #a00; }
      .viewer { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .viewer .imgwrap { flex: 1; text-align: center; }
      .viewer .btn { min-width: 80px; }
      .counter { color: #555; font-size: 0.9em; text-align: center; margin-top: 4px; }
      .slide-header { display: flex; justify-content: space-between; align-items: center; }
      .delete-slide-btn { padding: 4px 8px; font-size: 0.8em; }
      .save-status { color: #888; font-size: 0.85em; margin-left: 8px; }
      .save-status.saved { color: green; }
      #ocrProgressWrap { height:8px; background:#eee; border-radius:4px; overflow:hidden; display:none; margin-top:6px; }
      #ocrProgressBar { height:100%; width:0%; background:#4caf50; transition: width .2s linear; }
    </style>
    """)
    parts.append("</head><body>")
    parts.append("<div class='topbar'>")
    parts.append(f"<div><a href='{url_for('index')}'>&larr; Back</a></div>")
    parts.append(f"<div><strong>conf:</strong> {html_escape(conf)} &nbsp; <strong>idd:</strong> {idd}</div>")
    parts.append("</div>")

    parts.append("<div class='layout'>")
    # LEFT
    parts.append("<div class='left'>")
    parts.append(f"<form method='POST' action='{url_for('view_entry', conf=conf, idd=idd)}'>")
    parts.append(f"<input type='hidden' id='img_idx_hidden' name='img_idx' value='{initial_img_idx}'>")
    parts.append("<div class='actions'>")
    parts.append("<button class='btn' type='submit' name='action' value='save'>Save Changes</button>")
    if is_done:
        parts.append("<button class='btn' type='submit' name='action' value='mark_incomplete'>Mark as Incomplete</button>")
    else:
        parts.append("<button class='btn' type='submit' name='action' value='save_and_mark_done'>Save & Mark as Complete</button>")
    parts.append("</div>")
    for slide in slides:
        section_index = slide.get("section_index")
        slide_index = slide.get("slide_index")
        texts = slide.get("texts", [])
        text_value = "\n".join(texts).replace("\\n", "\n")
        parts.append("<div class='slide'>")
        parts.append("<div class='slide-header'>")
        parts.append(f"<h4>Section {section_index} — Slide {slide_index}</h4>")
        parts.append(f"<button class='btn danger delete-slide-btn' type='submit' name='action' value='delete_slide_{section_index}_{slide_index}'>Delete Slide</button>")
        parts.append(f"<span class='save-status' id='status_slide_{slide_index}'></span>")
        parts.append("</div>")
        parts.append(f"<textarea id='ta_slide_{slide_index}' data-autosave-url='{url_for('autosave_slide', conf=conf, idd=idd, slide_index=slide_index)}' name='slide_{slide_index}'>{html_escape(text_value)}</textarea>")
        parts.append("</div>")
    parts.append("<div class='actions'>")
    parts.append("<button class='btn' type='submit' name='action' value='save'>Save Changes</button>")
    parts.append("</div>")
    parts.append("</form>")
    parts.append(f"<form method='POST' action='{url_for('view_entry', conf=conf, idd=idd)}'>")
    parts.append("<button class='btn danger' type='submit' name='action' value='delete'>Delete this presentation from JSON</button>")
    parts.append("</form>")
    parts.append("</div>")

    # RIGHT
    parts.append("<div class='right'>")
    if images:
        img_base = url_for("serve_image", conf=conf, idd=idd, filename="")
        parts.append("<div class='viewer'>")
        parts.append("<button class='btn' type='button' id='prevBtn'>&larr; Prev</button>")
        parts.append("<button class='btn' type='button' id='runOcrBtn'>Run OCR</button><span class='save-status' id='ocr_status'></span>")
        parts.append("<button class='btn' type='button' id='runOcrAllBtn'>Run OCR All</button><span class='save-status' id='ocr_all_status'></span>")
        parts.append("<button class='btn' type='button' id='nextBtn'>Next &rarr;</button>")
        parts.append("</div>")
        # Progress bar + detail
        parts.append("<div id='ocrProgressWrap'><div id='ocrProgressBar'></div></div>")
        parts.append("<div class='save-status' id='ocr_all_detail'></div>")

        parts.append("<div class='imgwrap'>")
        initial_image = images[initial_img_idx] if images else ""
        parts.append(f"<img id='viewerImg' src='{img_base}{initial_image}' alt='slide image'>")
        parts.append(f"<div class='counter' id='viewerCounter'>{initial_img_idx + 1} / {len(images)}</div>")
        parts.append("</div>")
        parts.append("<script>")
        # constants
        parts.append(f"const IMG_BASE = '{img_base}';\n")
        parts.append(f"const IMAGES = {json.dumps(images)};\n")
        parts.append(f"const OCR_URL = '{url_for('ocr_run', conf=conf, idd=idd)}';\n")
        parts.append(f"const OCR_ALL_URL = '{url_for('ocr_all', conf=conf, idd=idd)}';\n")
        parts.append(f"const OCR_PROGRESS_URL = '{url_for('ocr_progress', conf=conf, idd=idd)}';\n")
        parts.append(f"const LLM_ENABLED = {str(_llm_enabled()).lower()}; const LLM_MODEL = '{os.environ.get('LLM_MODEL','openai/gpt-oss-20b')}';\n")
        parts.append(f"let idx = {initial_img_idx};\n")
        # JS functions (no f-string braces)
        parts.append("function show(){\n  const img = document.getElementById('viewerImg');\n  const ctr = document.getElementById('viewerCounter');\n  const hidden = document.getElementById('img_idx_hidden');\n  if (!img) return;\n  idx = Math.max(0, Math.min(idx, IMAGES.length - 1));\n  img.src = IMG_BASE + IMAGES[idx];\n  if (ctr) ctr.textContent = (idx+1) + ' / ' + IMAGES.length;\n  if (hidden) hidden.value = idx;\n}\n")
        parts.append("document.getElementById('prevBtn').onclick = function(){ idx = (idx - 1 + IMAGES.length) % IMAGES.length; show(); };\n")
        parts.append("document.getElementById('nextBtn').onclick = function(){ idx = (idx + 1) % IMAGES.length; show(); };\n")
        parts.append("document.addEventListener('keydown', function(e) { if (e.key === 'ArrowLeft') document.getElementById('prevBtn').click(); if (e.key === 'ArrowRight') document.getElementById('nextBtn').click(); });\n")
        # Autosave
        parts.append("function debounce(fn, ms){ let t; return function(){ const self=this, args=arguments; clearTimeout(t); t=setTimeout(function(){ fn.apply(self,args); }, ms); }; }\n")
        parts.append("function setupAutosave(){\n  const areas = document.querySelectorAll(\"textarea[id^='ta_slide_']\");\n  areas.forEach(function(ta){\n    const url = ta.dataset.autosaveUrl;\n    const match = ta.id.match(/ta_slide_(\\d+)/);\n    const idxSlide = match ? match[1] : '';\n    const status = document.getElementById('status_slide_' + idxSlide);\n    const save = debounce(function(){\n      fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text: ta.value }) })\n        .then(function(r){ return r.ok ? r.json() : Promise.reject(); })\n        .then(function(){ if(status){ status.textContent='Saved'; status.classList.add('saved'); setTimeout(function(){ status.textContent=''; status.classList.remove('saved'); }, 1200); } })\n        .catch(function(){ if(status){ status.textContent='Error'; status.classList.remove('saved'); } });\n    }, 800);\n    ta.addEventListener('input', save);\n  });\n}\n")
        # Polling for OCR All progress
        parts.append("let ocrAllPollTimer = null;\n")
        parts.append("function pollOcrAllProgress(){\n  fetch(OCR_PROGRESS_URL).then(r => r.json()).then(p => {\n"
                     "    const wrap = document.getElementById('ocrProgressWrap');\n"
                     "    const bar  = document.getElementById('ocrProgressBar');\n"
                     "    const detail = document.getElementById('ocr_all_detail');\n"
                     "    if (!p || !p.total){ return; }\n"
                     "    wrap.style.display = 'block';\n"
                     "    const pct = Math.min(100, Math.round(100 * (p.current || 0) / p.total));\n"
                     "    bar.style.width = pct + '%';\n"
                     "    detail.textContent = (p.phase || 'working') + ' ' + (p.current || 0) + '/' + p.total + (p.file ? (' — ' + p.file) : '');\n"
                     "    if (p.phase === 'done' || p.phase === 'error') { clearInterval(ocrAllPollTimer); }\n"
                     "  }).catch(()=>{});\n}\n")
        parts.append("document.getElementById('runOcrBtn').onclick = function(){\n"
                     "  const status = document.getElementById('ocr_status');\n"
                     "  if(status){ status.textContent='Running OCR' + (LLM_ENABLED ? (' + ' + LLM_MODEL) : '') + '...'; status.classList.remove('saved'); }\n"
                     "  const payload = { img_idx: idx, after_slide_index: -1 };\n"
                     "  fetch(OCR_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })\n"
                     "    .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error || 'OCR failed'); }); })\n"
                     "    .then(function(){ if(status){ status.textContent='OCR added'; status.classList.add('saved'); } window.location = window.location.pathname + '?img_idx=' + idx; })\n"
                     "    .catch(function(err){ if(status){ status.textContent = 'OCR error'; status.classList.remove('saved'); } console.error(err); });\n"
                     "};\n")
        parts.append("document.getElementById('runOcrAllBtn').onclick = function(){\n"
                     "  const status = document.getElementById('ocr_all_status');\n"
                     "  if(status){ status.textContent='Running OCR ALL' + (LLM_ENABLED ? (' + ' + LLM_MODEL) : '') + '...'; status.classList.remove('saved'); }\n"
                     "  const payload = { threshold: 0.9 };\n"
                     "  ocrAllPollTimer = setInterval(pollOcrAllProgress, 300);\n"
                     "  pollOcrAllProgress();\n"
                     "  fetch(OCR_ALL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })\n"
                     "    .then(function(r){ return r.ok ? r.json() : r.json().then(function(e){ throw new Error(e.error || 'OCR all failed'); }); })\n"
                     "    .then(function(res){ if(status){ status.textContent='Added ' + (res.added||0) + ' slides'; status.classList.add('saved'); } pollOcrAllProgress(); setTimeout(function(){ window.location = window.location.pathname + '?img_idx=' + idx; }, 250); })\n"
                     "    .catch(function(err){ if(status){ status.textContent = 'OCR all error'; status.classList.remove('saved'); } console.error(err); });\n"
                     "};\n")
        parts.append("setupAutosave();\nshow();\n</script>")
    parts.append("</div>")  # right
    parts.append("</div>")  # layout
    parts.append("</body></html>")
    return "".join(parts)


@app.post("/autosave/<conf>/<int:idd>/<int:slide_index>")
def autosave_slide(conf: str, idd: int, slide_index: int):
    try:
        payload = request.get_json(force=True, silent=True) or {}
        text_blob = payload.get("text", "")
        entries = read_conf_entries(conf)
        entry = get_entry_by_idd(entries, idd)
        slides = entry.get("slides", [])
        for slide in slides:
            try:
                if int(slide.get("slide_index")) == int(slide_index):
                    cleaned_blob = text_blob.replace("\r", "")
                    slide["texts"] = [cleaned_blob.replace("\n", "\\n")]
            except Exception:
                continue
        write_conf_entries(conf, entries)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

@app.post("/ocr/<conf>/<int:idd>")
def ocr_run(conf: str, idd: int):
    try:
        payload = request.get_json(force=True, silent=True) or {}
        img_idx = int(payload.get("img_idx", 0))
        after_slide_index = int(payload.get("after_slide_index", -1))

        images = list_images(conf, idd)
        if not images:
            return jsonify({"ok": False, "error": "No images found"}), 400
        if not (0 <= img_idx < len(images)):
            return jsonify({"ok": False, "error": "img_idx out of range"}), 400

        image_filename = images[img_idx]
        image_path = os.path.join(DATA_RAW_DIR, conf, str(idd), image_filename)

        try:
            ocr_text = ocr_extract_text(image_path)
        except Exception as e:
            return jsonify({"ok": False, "error": f"OCR failed: {e}"}), 400

        norm = normalize_ocr_text(ocr_text or "")
        if not norm.strip():
            return jsonify({"ok": False, "error": "OCR produced empty text"}), 422

        try:
            cleaned = clean_with_llm(norm)  # HARD-REQUIRED
        except Exception as e:
            return jsonify({"ok": False, "error": f"LLM required and failed: {e}"}), 502

        lines = [cleaned.replace("\n", "\\n")]

        entries = read_conf_entries(conf)
        entry = get_entry_by_idd(entries, idd)
        slides = entry.get("slides")
        if not isinstance(slides, list):
            slides = []
            entry["slides"] = slides

        insert_pos = len(slides)
        new_section_index = 0
        if after_slide_index >= 0:
            for i, s in enumerate(slides):
                try:
                    if int(s.get("slide_index")) == after_slide_index:
                        insert_pos = i + 1
                        new_section_index = int(s.get("section_index", 0))
                        break
                except Exception:
                    continue

        max_index = -1
        for s in slides:
            try:
                max_index = max(max_index, int(s.get("slide_index")))
            except Exception:
                continue
        new_slide_index = max_index + 1

        new_slide = {
            "section_index": new_section_index,
            "slide_index": new_slide_index,
            "texts": lines,
        }
        slides.insert(insert_pos, new_slide)
        try:
            dedupe_slides_in_place(slides, DEDUPE_THRESHOLD_DEFAULT)
        except Exception:
            pass
        write_conf_entries(conf, entries)
        exists_new = any(
            (int(s.get("slide_index")) == int(new_slide_index))
            for s in slides if isinstance(s, dict)
        )
        return jsonify({"ok": True, "new_slide_index": new_slide_index, "deduped_removed": (not exists_new)})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400


# Helper: run OCR+LLM for a single entry in background
def _ocr_all_worker(conf: str, idd: int, threshold: float):
    try:
        images = list_images(conf, idd)
        if not images:
            _set_progress(conf, idd, phase="error", current=0, total=0, error="No images found")
            return
        _set_progress(conf, idd, phase="starting", current=0, total=len(images))
        base_dir = os.path.join(DATA_RAW_DIR, conf, str(idd))

        # Phase 1: OCR + normalize (sequential I/O bound)
        to_clean: List[Tuple[int, str]] = []   # (logical_index, normalized_text)
        file_of: List[str] = []                # file names aligned to logical_index
        skipped_empty = 0
        failed_llm = 0
        used_fallback = 0

        for i, fname in enumerate(images):
            _set_progress(conf, idd, phase="ocr", current=i, total=len(images), file=fname)
            text = ocr_extract_text(os.path.join(base_dir, fname))

            _set_progress(conf, idd, phase="normalize", current=i + 0.25, total=len(images), file=fname)
            text = normalize_ocr_text(text or "")

            if text.strip():
                # Defer LLM to the concurrent phase
                logical_idx = len(to_clean)
                to_clean.append((logical_idx, text))
                file_of.append(fname)
            else:
                skipped_empty += 1

            _set_progress(conf, idd, phase="collect", current=i + 1, total=len(images), file=fname)
            time.sleep(0.02)

        if not to_clean:
            _set_progress(conf, idd, phase="done", current=len(images), total=len(images),
                          added=0, skipped_empty=skipped_empty, failed_llm=0, used_fallback=0)
            return

        # Phase 2: LLM clean concurrently (CPU/latency bound)
        _set_progress(conf, idd, phase="clean", current=0, total=len(to_clean))

        cleaned_by_idx: List[Optional[str]] = [None] * len(to_clean)
        with ThreadPoolExecutor(max_workers=LLM_CONCURRENCY) as ex:
            futs = {ex.submit(_clean_one_llm, idx, txt): idx for (idx, txt) in to_clean}
            done_count = 0
            for fut in as_completed(futs):
                idx = futs[fut]
                ok, payload, model_used = False, None, None
                try:
                    _idx, ok, payload, model_used = fut.result()
                except Exception as e:
                    ok, payload, model_used = False, str(e), None

                if ok:
                    cleaned_by_idx[idx] = payload  # string
                    if model_used == LLM_FALLBACK:
                        used_fallback += 1
                else:
                    failed_llm += 1
                    # Keep None for this index; we won't write a slide for it

                done_count += 1
                # Show per-phase progress against to_clean length; include last processed file if you want:
                last_file = file_of[min(idx, len(file_of)-1)] if file_of else ""
                _set_progress(conf, idd, phase="clean", current=done_count, total=len(to_clean), file=last_file)

        # Use only cleaned outputs (strict). Skip empty/failed ones.
        texts: List[str] = [t for t in cleaned_by_idx if isinstance(t, str) and t.strip()]

        _set_progress(conf, idd, phase="dedupe", current=len(images), total=len(images))
        # Deduplicate final cleaned texts
        deduped: List[str] = []
        for t in texts:
            if not deduped:
                deduped.append(t); continue
            if text_similarity_ratio(deduped[-1], t) >= threshold:
                deduped[-1] = t
            else:
                deduped.append(t)

        _set_progress(conf, idd, phase="write", current=len(images), total=len(images))
        entries = read_conf_entries(conf)
        entry = get_entry_by_idd(entries, idd)
        slides = entry.get("slides")
        if not isinstance(slides, list):
            slides = []
            entry["slides"] = slides

        max_index = -1
        for s in slides:
            try:
                max_index = max(max_index, int(s.get("slide_index")))
            except Exception:
                continue
        next_index = max_index + 1
        pre_len = len(slides)

        for text in deduped:
            if not text.strip():
                continue
            lines = [text.replace("\n", "\\n")]
            slides.append({
                "section_index": 0,
                "slide_index": next_index,
                "texts": lines,
            })
            next_index += 1

        try:
            dedupe_slides_in_place(slides, threshold)
        except Exception:
            pass

        write_conf_entries(conf, entries)
        post_len = len(slides)
        added_actual = max(0, post_len - pre_len)

        _set_progress(
            conf, idd,
            phase="done",
            current=len(images), total=len(images),
            added=added_actual,
            skipped_empty=skipped_empty,
            failed_llm=failed_llm,
            used_fallback=used_fallback
        )
    except Exception as e:
        _set_progress(conf, idd, phase="error", error=str(e))



@app.post("/ocr_all/<conf>/<int:idd>")
def ocr_all(conf: str, idd: int):
    try:
        payload = request.get_json(force=True, silent=True) or {}
        threshold = float(payload.get("threshold", DEDUPE_THRESHOLD_DEFAULT))
        key = _progress_key(conf, idd)
        t = SINGLE_WORKERS.get(key)
        if t and t.is_alive():
            return jsonify({"ok": False, "running": True, "message": "OCR all already running"}), 409
        # Seed progress so polling shows immediately
        _set_progress(conf, idd, phase="queued", current=0, total=0)
        t = Thread(target=_ocr_all_worker, args=(conf, idd, threshold), daemon=True)
        SINGLE_WORKERS[key] = t
        t.start()
        return jsonify({"ok": True, "started": True})
    except Exception as e:
        _set_progress(conf, idd, phase="error", error=str(e))
        return jsonify({"ok": False, "error": str(e)}), 400


@app.get("/ocr_progress/<conf>/<int:idd>")
def ocr_progress(conf: str, idd: int):
    key = _progress_key(conf, idd)
    with OCR_LOCK:
        return jsonify(OCR_PROGRESS.get(key, {"phase": "idle", "current": 0, "total": 0}))


@app.post("/ocr_all_pending")
def ocr_all_pending():
    try:
        payload = request.get_json(force=True, silent=True) or {}
        threshold = float(payload.get("threshold", DEDUPE_THRESHOLD_DEFAULT))
        # Prevent concurrent batch runs
        state = _get_batch()
        if state.get("running"):
            return jsonify({"ok": False, "running": True, "message": "Batch already running"}), 409

        # Build targets in the current index order
        done = read_done_status()
        confs = list_available_confs()
        # Use a set to enforce uniqueness, then convert back to list
        target_set = set()
        targets: List[tuple] = []
        for conf in confs:
            try:
                entries = read_conf_entries(conf)
            except Exception:
                continue
            for e in entries:
                pid = f"{conf}/{e.get('idd')}"
                if pid in done:
                    continue
                try:
                    slides = e.get("slides", [])
                    if isinstance(slides, list) and len(slides) > 0:
                        # Already processed: skip in batch run
                        continue
                except Exception:
                    pass
                key = (conf, int(e.get("idd")))
                if key not in target_set:
                    target_set.add(key)
                    targets.append(key)
        total_presentations = len(targets)

        # Initialize batch progress and spawn background worker
        _set_batch(running=True, total=total_presentations, processed=0, current_conf=None, current_idd=None, entry=None, result=None)

        def _worker(targets_list: List[tuple], thr: float):
            summary = {
                "total": total_presentations,
                "processed": 0,
                "added_total": 0,
                "skipped_empty_total": 0,
                "used_fallback_total": 0,
                "errors": [],
                "items": [],
            }
            for (conf, idd) in targets_list:
                _set_batch(current_conf=conf, current_idd=idd)
                try:
                    images = list_images(conf, idd)
                    if not images:
                        summary["items"].append({"conf": conf, "idd": idd, "ok": False, "error": "no_images"})
                        summary["processed"] += 1
                        _set_batch(processed=summary["processed"], entry=None)
                        continue

                    _set_progress(conf, idd, phase="starting", current=0, total=len(images))
                    _set_batch(entry=OCR_PROGRESS.get(_progress_key(conf, idd)))

                    base_dir = os.path.join(DATA_RAW_DIR, conf, str(idd))
                    to_clean: List[Tuple[int, str]] = []
                    file_of: List[str] = []
                    skipped_empty = 0
                    used_fallback = 0

                    # Phase 1: OCR+normalize
                    for i, fname in enumerate(images):
                        _set_progress(conf, idd, phase="ocr", current=i, total=len(images), file=fname)
                        _set_batch(entry=OCR_PROGRESS.get(_progress_key(conf, idd)))
                        text = ocr_extract_text(os.path.join(base_dir, fname))

                        _set_progress(conf, idd, phase="normalize", current=i + 0.25, total=len(images), file=fname)
                        _set_batch(entry=OCR_PROGRESS.get(_progress_key(conf, idd)))
                        text = normalize_ocr_text(text or "")

                        if text.strip():
                            logical_idx = len(to_clean)
                            to_clean.append((logical_idx, text))
                            file_of.append(fname)
                        else:
                            skipped_empty += 1

                        _set_progress(conf, idd, phase="collect", current=i + 1, total=len(images), file=fname)
                        _set_batch(entry=OCR_PROGRESS.get(_progress_key(conf, idd)))
                        time.sleep(0.02)

                    # Phase 2: LLM clean concurrently
                    _set_progress(conf, idd, phase="clean", current=0, total=len(to_clean))
                    _set_batch(entry=OCR_PROGRESS.get(_progress_key(conf, idd)))

                    cleaned_by_idx: List[Optional[str]] = [None] * len(to_clean)
                    failed_llm_local = 0

                    with ThreadPoolExecutor(max_workers=LLM_CONCURRENCY) as ex:
                        futs = {ex.submit(_clean_one_llm, idx, txt): idx for (idx, txt) in to_clean}
                        done_count = 0
                        for fut in as_completed(futs):
                            idx = futs[fut]
                            try:
                                _idx, ok, payload, model_used = fut.result()
                            except Exception as e:
                                ok, payload, model_used = False, str(e), None
                            if ok:
                                cleaned_by_idx[idx] = payload or ""
                                if model_used == LLM_FALLBACK:
                                    used_fallback += 1
                            else:
                                failed_llm_local += 1
                            done_count += 1
                            last_file = file_of[min(idx, len(file_of)-1)] if file_of else ""
                            _set_progress(conf, idd, phase="clean", current=done_count, total=len(to_clean), file=last_file)
                            _set_batch(entry=OCR_PROGRESS.get(_progress_key(conf, idd)))

                    # Aggregate failures into summary
                    if failed_llm_local:
                        summary["failed_llm_total"] = summary.get("failed_llm_total", 0) + failed_llm_local

                    # Use only cleaned outputs (strict). Skip empty/failed ones.
                    texts: List[str] = [t for t in cleaned_by_idx if isinstance(t, str) and t.strip()]

                    _set_progress(conf, idd, phase="dedupe", current=len(images), total=len(images))
                    _set_batch(entry=OCR_PROGRESS.get(_progress_key(conf, idd)))
                    deduped: List[str] = []
                    for t in texts:
                        if not deduped:
                            deduped.append(t); continue
                        if text_similarity_ratio(deduped[-1], t) >= thr:
                            deduped[-1] = t
                        else:
                            deduped.append(t)

                    _set_progress(conf, idd, phase="write", current=len(images), total=len(images))
                    _set_batch(entry=OCR_PROGRESS.get(_progress_key(conf, idd)))
                    entries = read_conf_entries(conf)
                    entry = get_entry_by_idd(entries, idd)
                    slides = entry.get("slides")
                    if not isinstance(slides, list):
                        slides = []
                        entry["slides"] = slides

                    max_index = -1
                    for s in slides:
                        try:
                            max_index = max(max_index, int(s.get("slide_index")))
                        except Exception:
                            continue
                    next_index = max_index + 1
                    pre_len = len(slides)

                    for text in deduped:
                        lines = [text.replace("\n", "\\n")]
                        slides.append({
                            "section_index": 0,
                            "slide_index": next_index,
                            "texts": lines,
                        })
                        next_index += 1

                    try:
                        dedupe_slides_in_place(slides, thr)
                    except Exception:
                        pass

                    write_conf_entries(conf, entries)
                    _set_progress(conf, idd, phase="done", current=len(images), total=len(images))
                    _set_batch(entry=OCR_PROGRESS.get(_progress_key(conf, idd)))

                    post_len = len(slides)
                    added = max(0, post_len - pre_len)
                    summary["processed"] += 1
                    summary["added_total"] += added
                    summary["skipped_empty_total"] += skipped_empty
                    summary["used_fallback_total"] += used_fallback
                    summary["items"].append({
                        "conf": conf,
                        "idd": idd,
                        "ok": True,
                        "added": added,
                        "skipped_empty": skipped_empty,
                        "used_fallback": used_fallback,
                        "failed_llm": summary.get("failed_llm_total", 0),
                    })

                    _set_batch(processed=summary["processed"]) 
                except Exception as e:
                    summary["processed"] += 1
                    summary["errors"].append({"conf": conf, "idd": idd, "error": str(e)})
                    _set_batch(processed=summary["processed"]) 

            # Save final result and mark done
            _set_batch(running=False, entry=None, current_conf=None, current_idd=None, result=summary)

        # Launch thread
        global BATCH_THREAD
        BATCH_THREAD = Thread(target=_worker, args=(targets, threshold), daemon=True)
        BATCH_THREAD.start()

        return jsonify({"ok": True, "started": True, "total": total_presentations})
    except Exception as e:
        _set_batch(running=False)
        return jsonify({"ok": False, "error": str(e)}), 400


@app.get("/ocr_all_pending_status")
def ocr_all_pending_status():
    state = _get_batch()
    # if a current entry is provided, include its OCR progress snapshot
    conf = state.get("current_conf")
    idd = state.get("current_idd")
    if conf and idd is not None:
        state["entry"] = OCR_PROGRESS.get(_progress_key(conf, int(idd)))
    return jsonify(state)


@app.route("/serve_image/<conf>/<int:idd>/<filename>", methods=["GET"])
def serve_image(conf: str, idd: int, filename: str) -> Response:
    image_path = os.path.join(DATA_RAW_DIR, conf, str(idd), filename)
    if not os.path.isfile(image_path):
        abort(404, description=f"Image file not found: {filename}")
    return send_from_directory(os.path.dirname(image_path), filename)


@app.get("/llm_status")
def llm_status():
    using_groq = bool(os.environ.get("GROQ_API_KEY")) or "groq.com" in str(os.environ.get("OPENAI_BASE_URL", ""))
    if using_groq:
        effective_base_url = os.environ.get("GROQ_BASE_URL") or "https://api.groq.com/openai/v1"
    else:
        effective_base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
    key_source = (
        "GROQ_API_KEY" if os.environ.get("GROQ_API_KEY") else (
            "OPENAI_API_KEY" if os.environ.get("OPENAI_API_KEY") else None
        )
    )
    return jsonify({
        "enabled": _llm_enabled(),
        "provider": "groq" if using_groq else "openai",
        "primary_model": LLM_PRIMARY,
        "fallback_model": LLM_FALLBACK,
        "timeout_s": LLM_TIMEOUT_S,
        "retries": LLM_RETRIES,
        "effective_base_url": effective_base_url,
        "key_source": key_source,
    })


if __name__ == "__main__":
    app.run(debug=True)
