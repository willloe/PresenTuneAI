# app/services/outline_service.py
from __future__ import annotations

import uuid, logging, re, json, os, urllib.parse, asyncio
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import HTTPException

from app.core.version import SCHEMA_VERSION
from app.core.telemetry import aspan, span
from app.core.config import settings
from app.models.schemas.outline import OutlineRequest
from app.models.schemas.slide import Deck, Slide, Meta, ListSection
from app.services.image_service import build_image_provider  # back-compat alias

log = logging.getLogger("app")

# -----------------------------------------------------------------------------
# Helpers for disk logging of HTTP requests/responses (always on)
# -----------------------------------------------------------------------------

def _uploads_root() -> Path:
    # Expect settings.STORAGE_DIR → "/app/data/uploads"
    return Path(settings.STORAGE_DIR)

def _http_log_dir() -> Path:
    # Save alongside uploads: "/app/data/http_logs"
    base = _uploads_root().parent
    d = base / "http_logs"
    d.mkdir(parents=True, exist_ok=True)
    return d

def _redact_headers(h: Dict[str, str]) -> Dict[str, str]:
    out = dict(h or {})
    for k in list(out.keys()):
        if k.lower() in ("authorization", "proxy-authorization", "x-api-key"):
            out[k] = "***"
    return out

def _dump_http(
    service: str,            # "runpod" | "agent"
    rid: str,                # short request id for correlation
    direction: str,          # "request" | "response"
    method: str,
    url: str,
    headers: Dict[str, str] | None,
    body: Any,
    status: Optional[int] = None,
) -> str:
    """
    Persist a full-fidelity HTTP record to JSON file and return its path.
    We ALWAYS redact Authorization headers to avoid credential leakage.
    """
    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S.%fZ")
    safe_headers = _redact_headers(headers or {})
    # Store body both as text and (when possible) JSON
    body_text: Optional[str] = None
    body_json: Optional[Any] = None
    if isinstance(body, (bytes, bytearray)):
        try:
            body_text = body.decode("utf-8", errors="replace")
        except Exception:
            body_text = repr(body)  # fallback for unknown encodings
    elif isinstance(body, str):
        body_text = body
        try:
            body_json = json.loads(body)
        except Exception:
            body_json = None
    else:
        # likely already a python object for JSON body
        body_json = body
        try:
            body_text = json.dumps(body, ensure_ascii=False)
        except Exception:
            body_text = str(body)

    record = {
        "timestamp": ts,
        "service": service,
        "rid": rid,
        "direction": direction,
        "method": method,
        "url": url,
        "status": status,
        "headers": safe_headers,
        "body_text": body_text,
        "body_json": body_json,
    }
    # File name: 20240910T123456.789012Z_runpod_ab12cd34_POST_request.json
    fname = f"{ts}_{service}_{rid}_{method.upper()}_{direction}.json"
    fpath = _http_log_dir() / fname
    try:
        fpath.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        log.warning("failed to write http dump %s: %s", fpath, e)
    return str(fpath)

# -----------------------------------------------------------------------------
# Text cleanup / utilities
# -----------------------------------------------------------------------------

_BAD_LINES = {"n", "contents", "table of contents", "toc", "index"}
_WS = re.compile(r"\s+")
_ARTIFACT = re.compile(r"\(cid:\d+\)")
_LEAD_NUM = re.compile(r"^[\s]*(?:\d+[\.\)]|[IVXLCM]+\.)\s+", re.IGNORECASE)
_BULLET_PREFIX = re.compile(r"^(\s*[-*\u2022\u00B7]\s*)+")

def _seed_lines(txt: str) -> List[str]:
    seeds: List[str] = []
    for ln in (txt or "").splitlines():
        s = ln.strip()
        if not s:
            continue
        s = _ARTIFACT.sub("", s)
        s = _BULLET_PREFIX.sub("", s)
        s = _LEAD_NUM.sub("", s)
        s = _WS.sub(" ", s).strip(" -—•·")
        if len(s) < 4:
            continue
        if s.lower() in _BAD_LINES:
            continue
        seeds.append(s)
    return seeds

def _clip(s: str, n: int = 80) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else (s[: n - 1].rstrip() + "…")

def _kw_from_title(title: str | None, topic_fallback: str | None) -> str:
    t = (title or "").strip()
    if ":" in t:
        t = t.split(":", 1)[1].strip()  # drop 'Slide N:'
    return t or (topic_fallback or "Presentation")

_DEFAULT_HEADINGS = [
    "Overview", "Goals", "Key Points", "Approach", "Timeline",
    "Milestones", "Risks & Mitigations", "Resources", "Metrics", "Next Steps",
]

# Disk helpers for parsed.json
def _parsed_json_path(upload_id: str) -> Path:
    return _uploads_root() / upload_id / "parsed.json"

def _safe_load_json(p: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None

def _atomic_write_json(p: Path, data: Dict[str, Any]) -> None:
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(p)
    except Exception:
        pass

def _ensure_slides_target_on_disk(upload_id: Optional[str], slide_count: int, topic: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Load parsed.json (full text lives here) and persist slides_target/topic
    for downstream visibility (non-destructive).
    """
    if not upload_id:
        return None
    path = _parsed_json_path(upload_id)
    data = _safe_load_json(path) or {}
    try:
        data["slides_target"] = int(slide_count)
    except Exception:
        pass
    if topic and not data.get("topic"):
        data["topic"] = topic
    _atomic_write_json(path, data)
    return data

# -----------------------------------------------------------------------------
# Strategies
# -----------------------------------------------------------------------------

class OutlineStrategy:
    async def generate_deck(self, req: OutlineRequest) -> Deck: ...
    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide: ...

@dataclass
class PlaceholderStrategy(OutlineStrategy):
    def _title_base(self, i: int, req: OutlineRequest, seeds: List[str]) -> str:
        from_doc = bool(seeds)
        topic = (getattr(req, "topic", None) or (seeds[0] if from_doc else "Untitled")).strip()
        if from_doc:
            return _clip(seeds[i % len(seeds)])
        heading = _DEFAULT_HEADINGS[i % len(_DEFAULT_HEADINGS)]
        return f"{_clip(topic)} — {heading}"

    def _default_sections(self, slide_id: str) -> List[ListSection]:
        return [
            ListSection(
                id=f"{slide_id}-l1",
                bullets=["placeholder bullet"],
                role="primary",
            )
        ]

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        text_val = getattr(req, "text", None)
        topic_val = getattr(req, "topic", None)
        if not (topic_val or text_val):
            raise HTTPException(400, "Provide either 'text' or 'topic'")

        n = max(1, min(int(getattr(req, "slide_count", 4) or 4), 15))
        seeds = _seed_lines((text_val or "").strip())
        from_doc = bool(seeds)
        topic = (topic_val or (seeds[0] if from_doc else "Untitled")).strip()

        async with aspan("outline_placeholder_generate", slide_count=n, from_doc=from_doc):
            slides: List[Slide] = []
            for i in range(n):
                s_id = uuid.uuid4().hex
                base = self._title_base(i, req, seeds)
                slides.append(
                    Slide(
                        id=s_id,
                        title=f"Slide {i+1}: {base}",
                        meta=Meta(sections=self._default_sections(s_id)),
                        notes=None,
                        layout="title_bullets_left",
                        media=[],
                    )
                )
            return Deck(
                version=SCHEMA_VERSION,
                topic=topic,
                source=None,
                slide_count=len(slides),
                created_at=datetime.utcnow(),
                slides=slides,
            )

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        n = max(1, min(int(getattr(req, "slide_count", 4) or 4), 15))
        if index < 0 or index >= n:
            raise HTTPException(400, f"index {index} out of range for slide_count={n}")
        seeds = _seed_lines((getattr(req, "text", "") or "").strip())
        async with aspan("outline_placeholder_regenerate", index=index):
            s_id = uuid.uuid4().hex
            base = self._title_base(index, req, seeds)
            return Slide(
                id=s_id,
                title=f"Slide {index+1}: {base}",
                meta=Meta(sections=self._default_sections(s_id)),
                notes=None,
                layout="title_bullets_left",
                media=[],
            )

# -----------------------------------------------------------------------------
# Agent helpers
# -----------------------------------------------------------------------------

def _pick_outline_payload(data: Any) -> Any:
    """Return inner outline/slides structure if present."""
    if isinstance(data, dict):
        # Prefer `slides`, then `outline`, then `output`
        if "slides" in data:
            return data["slides"]
        if "outline" in data:
            return data["outline"]
        if "output" in data:
            out = data["output"]
            if isinstance(out, dict):
                if "slides" in out:
                    return out["slides"]
                if "outline" in out:
                    return out["outline"]
            return out
    return data

def _agent_outline_to_deck(agent_obj: Any, req: OutlineRequest) -> Deck:
    def to_str(x: Any) -> str:
        return "" if x is None else str(x).strip()

    def to_bullets(x: Any) -> List[str]:
        if x is None:
            return []
        if isinstance(x, list):
            # Keep only non-empty strings
            return [to_str(i) for i in x if to_str(i)]
        # Fallbacks: single string/number → single bullet
        return [to_str(x)] if to_str(x) else []

    # Normalize incoming JSON
    if isinstance(agent_obj, str):
        try:
            agent_obj = json.loads(agent_obj)
        except Exception:
            agent_obj = agent_obj.strip()

    # Flatten slides list/dict into an ordered list of slide nodes
    slides_data: List[Any] = []
    if isinstance(agent_obj, list):
        slides_data = agent_obj
    elif isinstance(agent_obj, dict):
        if "slides" in agent_obj and isinstance(agent_obj["slides"], dict):
            # e.g. {"slides": {"slide 1": {...}, "slide 2": {...}}}
            keys_sorted = sorted(
                agent_obj["slides"].keys(),
                key=lambda x: int(re.sub(r"[^\d]", "", str(x)) or 0)
            )
            slides_data = [agent_obj["slides"][k] for k in keys_sorted]
        elif "slides" in agent_obj and isinstance(agent_obj["slides"], list):
            slides_data = agent_obj["slides"]
        elif "outline" in agent_obj and isinstance(agent_obj["outline"], (list, dict)):
            inner = agent_obj["outline"]
            if isinstance(inner, list):
                slides_data = inner
            else:
                keys_sorted = sorted(inner.keys(), key=lambda x: int(re.sub(r"[^\d]", "", str(x)) or 0))
                slides_data = [inner[k] for k in keys_sorted]
        else:
            keys_sorted = sorted(agent_obj.keys(), key=lambda x: int(re.sub(r"[^\d]", "", str(x)) or 0))
            slides_data = [agent_obj[k] for k in keys_sorted]
    else:
        slides_data = [agent_obj]

    def extract_title_and_bullets(node: Any, idx_zero: int) -> tuple[str, List[str]]:
        # Handles {"text": {"title": "...", "bullets": [...]}}
        if isinstance(node, dict) and "text" in node:
            tnode = node["text"]
            if isinstance(tnode, dict):
                title = to_str(tnode.get("title")) or to_str(tnode.get("heading")) or to_str(tnode.get("slide_title"))
                bullets = to_bullets(tnode.get("bullets") or tnode.get("points") or tnode.get("items") or tnode.get("content"))
                return (title or f"Slide {idx_zero+1}", bullets)
            if isinstance(tnode, list):
                return (f"Slide {idx_zero+1}", to_bullets(tnode))
            if isinstance(tnode, (str, int, float)):
                return (to_str(tnode) or f"Slide {idx_zero+1}", [])
        # Generic dict fallbacks
        if isinstance(node, dict):
            title = to_str(node.get("title")) or to_str(node.get("heading")) or to_str(node.get("slide_title"))
            bullets = to_bullets(node.get("bullets") or node.get("points") or node.get("items") or node.get("content"))
            if title or bullets:
                return (title or f"Slide {idx_zero+1}", bullets)
            if len(node) == 1:
                k, v = next(iter(node.items()))
                return (to_str(k) or f"Slide {idx_zero+1}", to_bullets(v))
        # Lists/strings
        if isinstance(node, list):
            return (f"Slide {idx_zero+1}", to_bullets(node))
        if isinstance(node, (str, int, float)):
            return (to_str(node) or f"Slide {idx_zero+1}", [])
        return (f"Slide {idx_zero+1}", [])

    slides: List[Slide] = []
    for idx, node in enumerate(slides_data):
        title, bullets = extract_title_and_bullets(node, idx)
        slide_id = uuid.uuid4().hex

        section_dict = {
            "kind": "list",          # <-- your model expects "list"
            "id": f"{slide_id}-l1",
            "bullets": bullets or [],
            "role": "primary",
        }

        log.info("[outline map] slide %s → title=%r bullets=%d", idx + 1, title, len(bullets or []))

        slides.append(
            Slide(
                id=slide_id,
                title=title or f"Slide {idx+1}",
                bullets=(bullets or None),             # keep legacy field in sync
                meta=Meta(sections=[section_dict]),    # dict-shaped section survives validation
                notes=None,
                layout="title_bullets_left",
                media=[],
            )
        )

    topic = (req.topic or "Presentation").strip() or "Presentation"
    return Deck(
        version=SCHEMA_VERSION,
        topic=topic,
        source=None,
        slide_count=len(slides),
        created_at=datetime.utcnow(),
        slides=slides,
    )

def _build_agent_payload(req: OutlineRequest, parsed_json: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build a rich payload for 'AgentStrategy' (internal/third-party models).
    For Runpod, we will strip this down to the minimal shape later.
    """
    payload: Dict[str, Any] = {
        "topic": getattr(req, "topic", None),
        "slide_count": int(getattr(req, "slide_count", 4) or 4),
        "text": getattr(req, "text", None),
    }
    if parsed_json is not None:
        payload["parsed"] = parsed_json  # contains full text: parsed["text"]
    else:
        payload["parsed"] = {
            "input": {
                "text": (getattr(req, "text", None) or ""),
                "slides_target": int(getattr(req, "slide_count", 4) or 4),
            }
        }
    return payload

# -----------------------------------------------------------------------------
# Generic Agent strategy (direct HTTP) with file dumps
# -----------------------------------------------------------------------------

@dataclass
class AgentStrategy(OutlineStrategy):
    url: str
    timeout_ms: int = settings.AGENT_TIMEOUT_MS

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        upload_id: Optional[str] = getattr(req, "upload_id", None)
        parsed_json = _ensure_slides_target_on_disk(upload_id, int(getattr(req, "slide_count", 4) or 4), getattr(req, "topic", None))
        payload = _build_agent_payload(req, parsed_json)

        rid = uuid.uuid4().hex[:8]
        url = self.url.rstrip("/") + "/outline"
        headers = {"Content-Type": "application/json"}

        async with httpx.AsyncClient(timeout=self.timeout_ms / 1000) as client:
            # --- dump request ---
            req_path = _dump_http("agent", rid, "request", "POST", url, headers, payload, status=None)
            async with aspan("agent_outline_request", url=self.url, path="/outline", timeout_ms=self.timeout_ms):
                r = await client.post(url, json=payload)
            # --- dump response ---
            res_path = _dump_http("agent", rid, "response", "POST", url, headers, r.text, status=r.status_code)
            log.info("[agent %s] saved request→%s response→%s", rid, req_path, res_path)

        with span("agent_outline_response", status=r.status_code, bytes=len(r.content)):
            ...
        r.raise_for_status()
        data = r.json()

        outline_obj = _pick_outline_payload(data)
        return _agent_outline_to_deck(outline_obj, req)

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        upload_id: Optional[str] = getattr(req, "upload_id", None)
        parsed_json = _ensure_slides_target_on_disk(upload_id, int(getattr(req, "slide_count", 4) or 4), getattr(req, "topic", None))
        payload = _build_agent_payload(req, parsed_json)
        payload["index"] = index

        rid = uuid.uuid4().hex[:8]
        url = self.url.rstrip("/") + f"/outline/{index}/regenerate"
        headers = {"Content-Type": "application/json"}

        async with httpx.AsyncClient(timeout=self.timeout_ms / 1000) as client:
            req_path = _dump_http("agent", rid, "request", "POST", url, headers, payload, status=None)
            async with aspan(
                "agent_regen_request", url=self.url, path=f"/outline/{index}/regenerate",
                index=index, timeout_ms=self.timeout_ms
            ):
                r = await client.post(url, json=payload)
            res_path = _dump_http("agent", rid, "response", "POST", url, headers, r.text, status=r.status_code)
            log.info("[agent %s] saved request→%s response→%s", rid, req_path, res_path)

        with span("agent_regen_response", status=r.status_code, bytes=len(r.content), index=index):
            ...
        r.raise_for_status()
        data = r.json()

        outline_obj = _pick_outline_payload(data)
        # Compat: if a single slide-like object, wrap into dict keyed by slide number
        if not isinstance(outline_obj, dict) or any(k for k in getattr(outline_obj, "keys", lambda: [])() if not str(k).lower().startswith("slide")):
            outline_obj = {f"slide {index+1}": outline_obj}

        deck = _agent_outline_to_deck(outline_obj, req)
        return deck.slides[0] if deck.slides else Slide(
            id=uuid.uuid4().hex,
            title=f"Slide {index+1}",
            meta=Meta(sections=[ListSection(id="auto", bullets=["(empty)"], role="primary")]),
            notes=None,
            layout="title_bullets_left",
            media=[],
        )

# -----------------------------------------------------------------------------
# Runpod Strategy (with file dumps)
# -----------------------------------------------------------------------------

RUNPOD_INPUT_MODE = os.getenv("RUNPOD_INPUT_MODE", "wrap").lower()  # retained, but we send minimal payload

@dataclass
class RunpodStrategy(OutlineStrategy):
    """
    Calls Runpod Serverless endpoint:
      - /runsync → returns {"output": ...}
      - /run     → returns {"id": "..."}; poll /status/{id} until COMPLETED
    Requires a Bearer token (env RUNPOD_API_KEY or AGENT_API_KEY).
    """
    url: str  # e.g., "https://api.runpod.ai/v2/<endpointId>/run" or "/runsync"
    timeout_ms: int = settings.AGENT_TIMEOUT_MS
    poll_interval_s: float = 1.5
    max_wait_s: Optional[int] = None  # default = timeout_ms/1000

    def _headers(self) -> Dict[str, str]:
        token = (
            getattr(settings, "AGENT_API_KEY", None)
            or os.getenv("RUNPOD_API_KEY")
            or os.getenv("AGENT_API_KEY")
        )
        hdrs = {"Content-Type": "application/json"}
        if token:
            hdrs["Authorization"] = f"Bearer {token.strip()}"
        return hdrs

    def _extract_text_for_runpod(self, payload: Dict[str, Any]) -> str:
        """
        STRICT: always take the full text from parsed.json contents when present.
        Fallback to payload["text"] or topic.
        """
        # Preferred: payload["parsed"]["text"]
        try:
            parsed = payload.get("parsed") or {}
            text = parsed.get("text")
            if isinstance(text, str) and text.strip():
                return text.strip()
        except Exception:
            pass

        # Secondary: payload["parsed"]["input"]["text"] (older shape)
        try:
            parsed = payload.get("parsed") or {}
            inner = parsed.get("input") or {}
            text = inner.get("text")
            if isinstance(text, str) and text.strip():
                return text.strip()
        except Exception:
            pass

        # Fallbacks
        if isinstance(payload.get("text"), str) and payload["text"].strip():
            return payload["text"].strip()
        topic = (payload.get("topic") or "").strip()
        return topic or "Presentation"

    def _slides_target_from_payload(self, payload: Dict[str, Any]) -> int:
        for path in [
            ("slide_count",),
            ("slides_target",),
            ("parsed", "slides_target"),
            ("parsed", "input", "slides_target"),
        ]:
            try:
                val = payload
                for key in path:
                    val = val.get(key, {})
                n = int(val)
                if n > 0:
                    return n
            except Exception:
                continue
        return 4

    def _is_runsync(self) -> bool:
        return self.url.rstrip("/").endswith("/runsync")

    def _status_url(self, job_id: str) -> str:
        base = self.url.rstrip("/")
        if base.endswith("/run"):
            base = base[:-4]
        return f"{base}/status/{job_id}"

    def _wrap_input(self, route: str, payload: Dict[str, Any], rid: str) -> Dict[str, Any]:
        """
        Build the **minimal** body for Runpod:
            {"input": {"text": <full_text>, "slides_target": <n>}}
        Always logs a short summary (no bodies) to stdout and full bodies to disk.
        """
        text = self._extract_text_for_runpod(payload)
        n = self._slides_target_from_payload(payload)

        # brief summary to normal logs (no bodies)
        try:
            txt_len = len((text or "").encode("utf-8"))
        except Exception:
            txt_len = 0
        log.info("[runpod %s] payload_summary text_len=%s parsed=%s slides_target=%s",
                 rid, txt_len, "yes" if payload.get("parsed") else "no", n)

        # Minimal payload per your requirement
        return {"input": {"text": text, "slides_target": n}}

    async def _post_json(self, client: httpx.AsyncClient, body: Dict[str, Any], rid: str) -> Dict[str, Any]:
        headers = self._headers()
        # dump request
        req_path = _dump_http("runpod", rid, "request", "POST", self.url, headers, body, status=None)
        r = await client.post(self.url, headers=headers, json=body)
        # dump response
        res_path = _dump_http("runpod", rid, "response", "POST", self.url, headers, r.text, status=r.status_code)
        log.info("[runpod %s] saved request→%s response→%s", rid, req_path, res_path)

        with span("runpod_post_response", status=r.status_code, bytes=len(r.content)):
            ...
        try:
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            text = (e.response.text or "")[:400]
            raise HTTPException(502, f"Runpod POST failed: {e.response.status_code} {text}") from e
        return r.json()

    async def _poll_status(self, client: httpx.AsyncClient, job_id: str, rid: str) -> Dict[str, Any]:
        deadline = (self.max_wait_s or int(self.timeout_ms / 1000))
        waited = 0.0
        status_url = self._status_url(job_id)
        headers = self._headers()
        while True:
            # dump request
            _ = _dump_http("runpod", rid, "request", "GET", status_url, headers, body=None, status=None)
            r = await client.get(status_url, headers=headers)
            # dump response
            _ = _dump_http("runpod", rid, "response", "GET", status_url, headers, r.text, status=r.status_code)

            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as e:
                text = (e.response.text or "")[:400]
                raise HTTPException(502, f"Runpod status failed: {e.response.status_code} {text}") from e

            js = r.json()
            status = (js.get("status") or "").upper()
            if status in {"COMPLETED", "SUCCEEDED", "SUCCESS"}:
                return js
            if status in {"FAILED", "CANCELLED", "CANCELED", "ERROR"}:
                raise HTTPException(502, f"Runpod job failed: {js}")
            await asyncio.sleep(self.poll_interval_s)
            waited += self.poll_interval_s
            if waited >= deadline:
                raise HTTPException(504, f"Runpod job timed out after {deadline}s")

    async def _invoke(self, route: str, payload: Dict[str, Any]) -> Any:
        """
        Live call enabled:
          - For /runsync endpoints, return js["output"] (or js) directly.
          - For /run endpoints, poll /status/{id} and return its .output.
        """
        rid = uuid.uuid4().hex[:8]
        body = self._wrap_input(route, payload, rid=rid)
        timeout_s = max(5, int(self.timeout_ms / 1000))
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            if self._is_runsync():
                async with aspan("runpod_runsync_call", url=self.url, route=route, timeout_s=timeout_s):
                    js = await self._post_json(client, body, rid=rid)
                return js.get("output", js)
            else:
                async with aspan("runpod_run_call", url=self.url, route=route, timeout_s=timeout_s):
                    js = await self._post_json(client, body, rid=rid)
                job_id = js.get("id") or js.get("jobId") or js.get("requestId")
                if not job_id:
                    return js.get("output", js)
                async with aspan("runpod_poll_status", job_id=job_id):
                    st = await self._poll_status(client, job_id, rid=rid)
                return st.get("output", st)

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        upload_id: Optional[str] = getattr(req, "upload_id", None)
        parsed_json = _ensure_slides_target_on_disk(upload_id, int(getattr(req, "slide_count", 4) or 4), getattr(req, "topic", None))
        payload = _build_agent_payload(req, parsed_json)  # rich payload; we will minimize in _wrap_input
        data = await self._invoke(route="/outline", payload=payload)
        outline_obj = _pick_outline_payload(data)
        return _agent_outline_to_deck(outline_obj, req)

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        upload_id: Optional[str] = getattr(req, "upload_id", None)
        parsed_json = _ensure_slides_target_on_disk(upload_id, int(getattr(req, "slide_count", 4) or 4), getattr(req, "topic", None))
        payload = _build_agent_payload(req, parsed_json)
        payload["index"] = index
        data = await self._invoke(route=f"/outline/{index}/regenerate", payload=payload)

        outline_obj = _pick_outline_payload(data)
        # Compat: if a single slide-like object, wrap into dict keyed by slide number
        if not isinstance(outline_obj, dict) or any(k for k in getattr(outline_obj, "keys", lambda: [])() if not str(k).lower().startswith("slide")):
            outline_obj = {f"slide {index+1}": outline_obj}
        deck = _agent_outline_to_deck(outline_obj, req)
        return deck.slides[0] if deck.slides else Slide(
            id=uuid.uuid4().hex,
            title=f"Slide {index+1}",
            meta=Meta(sections=[ListSection(id="auto", bullets=["(empty)"], role="primary")]),
            notes=None,
            layout="title_bullets_left",
            media=[],
        )

# -----------------------------------------------------------------------------
# OutlineService
# -----------------------------------------------------------------------------

@dataclass
class OutlineService:
    primary: OutlineStrategy
    fallback: OutlineStrategy
    _img_provider = None  # cached provider instance

    def _provider(self):
        if self._img_provider is None:
            self._img_provider = build_image_provider()
        return self._img_provider

    async def _enrich_images(self, deck: Deck) -> Deck:
        if not settings.FEATURE_IMAGE_API:
            return deck

        provider = self._provider()
        provider_name = provider.__class__.__name__
        async with aspan("image_enrich_deck", slides=len(deck.slides), provider=provider_name):
            for idx, s in enumerate(deck.slides):
                if getattr(s, "media", None) and len(s.media) > 0:
                    continue
                kw = _kw_from_title(s.title, deck.topic)
                async with aspan("image_enrich_slide", idx=idx, kw=kw):
                    try:
                        media = await provider.image_for(kw, idx)
                        if media:
                            s.media = [media]
                        else:
                            with span("image_enrich_miss", idx=idx, kw=kw):
                                ...
                    except Exception as e:
                        log.warning("image_enrich_error idx=%s kw=%s: %s", idx, kw, e)
                        with span("image_enrich_error", idx=idx, kw=kw, err=type(e).__name__):
                            ...
        return deck

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        try:
            async with aspan("outline_generate", strategy=self.primary.__class__.__name__):
                log.info("[outline] using primary strategy=%s", self.primary.__class__.__name__)
                deck = await self.primary.generate_deck(req)
        except Exception as e:
            log.warning("outline primary failed; using fallback (%s: %s)", type(e).__name__, str(e)[:200], exc_info=True)
            async with aspan("outline_generate_fallback", strategy=self.fallback.__class__.__name__):
                deck = await self.fallback.generate_deck(req)
        deck = await self._enrich_images(deck)
        return deck

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        try:
            async with aspan("outline_regenerate", strategy=self.primary.__class__.__name__, index=index):
                log.info("[outline] regen using primary strategy=%s", self.primary.__class__.__name__)
                slide = await self.primary.regenerate_slide(index, req)
        except Exception as e:
            log.warning("outline regen primary failed; using fallback (%s: %s)", type(e).__name__, str(e)[:200], exc_info=True)
            async with aspan("outline_regenerate_fallback", strategy=self.fallback.__class__.__name__, index=index):
                slide = await self.fallback.regenerate_slide(index, req)

        if settings.FEATURE_IMAGE_API:
            provider = self._provider()
            kw = _kw_from_title(getattr(slide, "title", None), getattr(req, "topic", None))
            async with aspan("image_enrich_slide", idx=index, kw=kw):
                try:
                    media = await provider.image_for(kw, index)
                    if media:
                        slide.media = [media]
                    else:
                        with span("image_enrich_miss", idx=index, kw=kw):
                            ...
                except Exception as e:
                    log.warning("image_enrich_error idx=%s kw=%s: %s", index, kw, e)
                    with span("image_enrich_error", idx=index, kw=kw, err=type(e).__name__):
                        ...
        return slide

# -----------------------------------------------------------------------------
# Builder
# -----------------------------------------------------------------------------

def build_outline_service() -> OutlineService:
    if settings.FEATURE_USE_MODEL and settings.AGENT_URL:  # type: ignore[truthy-bool]
        host = urllib.parse.urlparse(settings.AGENT_URL).hostname or ""
        if "api.runpod.ai" in host:
            log.info("[outline] selecting RunpodStrategy url=%s mode=%s", settings.AGENT_URL, RUNPOD_INPUT_MODE)
            return OutlineService(
                primary=RunpodStrategy(url=settings.AGENT_URL, timeout_ms=settings.AGENT_TIMEOUT_MS),
                fallback=PlaceholderStrategy(),
            )
        log.info("[outline] selecting AgentStrategy url=%s", settings.AGENT_URL)
        return OutlineService(
            primary=AgentStrategy(url=settings.AGENT_URL, timeout_ms=settings.AGENT_TIMEOUT_MS),
            fallback=PlaceholderStrategy(),
        )
    log.info("[outline] selecting PlaceholderStrategy (no model)")
    return OutlineService(primary=PlaceholderStrategy(), fallback=PlaceholderStrategy())
