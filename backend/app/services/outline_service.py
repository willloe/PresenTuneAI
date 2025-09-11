# app/services/outline_service.py
from __future__ import annotations

import uuid, logging, re, json, os, urllib.parse, asyncio
from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from pathlib import Path

import httpx
from fastapi import HTTPException

from app.core.version import SCHEMA_VERSION
from app.core.telemetry import aspan, span
from app.core.config import settings
from app.models.schemas.outline import OutlineRequest
from app.models.schemas.slide import Deck, Slide, Meta, ListSection
from app.services.image_service import build_image_provider
from app.services.layouts_service import (
    filter_layouts as choose_layouts,
    list_layouts as list_layouts_lib,
)

log = logging.getLogger("app")

# ────────────────────────────────────────────────────────────────────────────────
# File system helpers & HTTP dump
# ────────────────────────────────────────────────────────────────────────────────

def _uploads_root() -> Path:
    return Path(settings.STORAGE_DIR)

def _parsed_json_path(upload_id: str) -> Path:
    return _uploads_root() / upload_id / "parsed.json"

def _safe_load_json(p: Path) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None

def _http_log_dir() -> Path:
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

def _dump_http(service: str, rid: str, direction: str, method: str, url: str,
               headers: Dict[str, str] | None, body: Any, status: Optional[int] = None) -> str:
    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S.%fZ")
    safe_headers = _redact_headers(headers or {})
    if isinstance(body, (bytes, bytearray)):
        try:
            body_text = body.decode("utf-8", errors="replace")
            body_json = None
        except Exception:
            body_text, body_json = repr(body), None
    elif isinstance(body, str):
        body_text = body
        try:
            body_json = json.loads(body)
        except Exception:
            body_json = None
    else:
        body_json = body
        try:
            body_text = json.dumps(body, ensure_ascii=False)
        except Exception:
            body_text = str(body)

    record = {
        "timestamp": ts, "service": service, "rid": rid, "direction": direction,
        "method": method, "url": url, "status": status, "headers": safe_headers,
        "body_text": body_text, "body_json": body_json,
    }
    fname = f"{ts}_{service}_{rid}_{method.upper()}_{direction}.json"
    fpath = _http_log_dir() / fname
    try:
        fpath.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        log.warning("failed to write http dump %s: %s", fpath, e)
    return str(fpath)

# ────────────────────────────────────────────────────────────────────────────────
# Text utilities
# ────────────────────────────────────────────────────────────────────────────────

_WS = re.compile(r"\s+")
_ARTIFACT = re.compile(r"\(cid:\d+\)")
_LEAD_NUM = re.compile(r"^[\s]*(?:\d+[\.\)]|[IVXLCM]+\.)\s+", re.IGNORECASE)
_BULLET_PREFIX = re.compile(r"^(\s*[-*\u2022\u00B7]\s*)+")
_DEFAULT_HEADINGS = [
    "Overview","Goals","Key Points","Approach","Timeline",
    "Milestones","Risks & Mitigations","Resources","Metrics","Next Steps",
]

def _clip(s: str, n: int = 80) -> str:
    s = (s or "").strip()
    return s if len(s) <= n else (s[: n - 1].rstrip() + "…")

def _kw_from_title(title: str | None, topic_fallback: str | None) -> str:
    t = (title or "").strip()
    if ":" in t:
        t = t.split(":", 1)[1].strip()
    return t or (topic_fallback or "Presentation")

# ────────────────────────────────────────────────────────────────────────────────
# Server-side Auto-Fit helpers
# ────────────────────────────────────────────────────────────────────────────────

def _first_layout_id() -> str:
    try:
        lib = list_layouts_lib() or {}
        items = lib.get("items") or []
        if items:
            return str(items[0].get("id") or "title_bullets_left")
    except Exception:
        pass
    return "title_bullets_left"

def _sec_kind(sec: Any) -> str:
    if isinstance(sec, dict):
        return str(sec.get("kind") or sec.get("type") or "").lower()
    return str(getattr(sec, "kind", "")).lower()

def _nonempty_list_bullets(sec: Any) -> list[str]:
    arr = list((sec.get("bullets") if isinstance(sec, dict) else getattr(sec, "bullets", [])) or [])
    return [str(b).strip() for b in arr if str(b or "").strip()]

def _nonempty_paragraph_text(sec: Any) -> str:
    t = str((sec.get("text") if isinstance(sec, dict) else getattr(sec, "text", "")) or "")
    return t.strip()

def _count_text_blocks_server(slide: "Slide") -> int:
    secs = []
    if getattr(slide, "meta", None) and getattr(slide.meta, "sections", None):
        secs = list(slide.meta.sections or [])

    count = 0
    for sec in secs:
        k = _sec_kind(sec)
        if k == "paragraph" and _nonempty_paragraph_text(sec):
            count += 1
        elif k == "list" and _nonempty_list_bullets(sec):
            count += 1

    if count == 0:
        legacy = [str(b).strip() for b in (getattr(slide, "bullets", None) or []) if str(b or "").strip()]
        if legacy:
            count = 1
    return count

def _heuristic_layout_id(text_count: int, image_count: int, default_id: str) -> str:
    if image_count >= 1 and text_count == 0:
        return "full_bleed_image_caption"
    if image_count >= 1 and text_count >= 1:
        return "image_right_bullets"
    if text_count >= 1 and image_count == 0:
        return "title_bullets_left"
    return default_id or "title_bullets_left"

# ────────────────────────────────────────────────────────────────────────────────
# Strategies
# ────────────────────────────────────────────────────────────────────────────────

class OutlineStrategy:
    async def generate_deck(self, req: OutlineRequest) -> Deck: ...
    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide: ...

@dataclass
class PlaceholderStrategy(OutlineStrategy):
    def _title_base(self, i: int, req: OutlineRequest, seeds: List[str]) -> str:
        topic = (getattr(req, "topic", None) or "Untitled").strip()
        heading = _DEFAULT_HEADINGS[i % len(_DEFAULT_HEADINGS)]
        return f"{_clip(topic)} — {heading}"

    def _default_sections(self, slide_id: str) -> List[ListSection]:
        return [ListSection(id=f"{slide_id}-l1", bullets=["placeholder bullet"], role="primary")]

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        n = max(1, min(int(getattr(req, "slide_count", 4) or 4), 15))
        slides: List[Slide] = []
        for i in range(n):
            s_id = uuid.uuid4().hex
            base = self._title_base(i, req, [])
            slides.append(Slide(
                id=s_id, title=f"Slide {i+1}: {base}",
                meta=Meta(sections=self._default_sections(s_id)),
                notes=None, layout="title_bullets_left", media=[],
            ))
        return Deck(
            version=SCHEMA_VERSION, topic=(getattr(req,"topic",None) or "Presentation").strip() or "Presentation",
            source=None, slide_count=len(slides), created_at=datetime.utcnow(), slides=slides
        )

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        s_id = uuid.uuid4().hex
        base = self._title_base(index, req, [])
        return Slide(
            id=s_id, title=f"Slide {index+1}: {base}",
            meta=Meta(sections=self._default_sections(s_id)),
            notes=None, layout="title_bullets_left", media=[],
        )

# ────────────────────────────────────────────────────────────────────────────────
# Outline payload helpers
# ────────────────────────────────────────────────────────────────────────────────

def _load_parsed_for_upload(upload_id: Optional[str]) -> Optional[Dict[str, Any]]:
    if not upload_id:
        return None
    return _safe_load_json(_parsed_json_path(upload_id)) or None

def _resolve_full_text(upload_id: Optional[str], req_text: Optional[str], topic: Optional[str],
                       parsed_json: Optional[Dict[str, Any]]) -> Tuple[str, str]:
    # in-memory parsed
    if isinstance(parsed_json, dict):
        t = parsed_json.get("text")
        if isinstance(t, str) and t.strip():
            return t.strip(), "parsed.json:memory"

    # disk fallback
    disk = _load_parsed_for_upload(upload_id)
    if isinstance(disk, dict):
        t2 = disk.get("text")
        if isinstance(t2, str) and t2.strip():
            return t2.strip(), "parsed.json:disk"

    # request text
    if isinstance(req_text, str) and req_text.strip():
        return req_text.strip(), "request.text"

    # final fallback
    return ((topic or "Presentation").strip() or "Presentation"), "topic"

def _build_agent_payload(req: OutlineRequest, parsed_json: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build a single, consistent payload for downstream strategies.
    We put the authoritative full text directly in payload["text"].
    """
    slide_count = int(getattr(req, "slide_count", 4) or 4)
    upload_id = getattr(req, "upload_id", None)
    topic = getattr(req, "topic", None)
    req_text = getattr(req, "text", None)

    text, src = _resolve_full_text(upload_id, req_text, topic, parsed_json)
    txt_len = len(text.encode("utf-8", errors="ignore"))
    log.info("[outline] resolved_text source=%s len=%s upload_id=%s", src, txt_len, upload_id or "-")

    payload: Dict[str, Any] = {
        "upload_id": upload_id,
        "topic": topic,
        "slide_count": slide_count,
        "text": text,
    }

    # Include parsed snapshot if available (optional)
    if isinstance(parsed_json, dict):
        pj = dict(parsed_json)
        try:
            pj.setdefault("slides_target", slide_count)
        except Exception:
            pass
        if topic and not pj.get("topic"):
            pj["topic"] = topic
        payload["parsed"] = pj

    return payload

def _pick_outline_payload(data: Any) -> Any:
    if isinstance(data, dict):
        if "slides" in data: return data["slides"]
        if "outline" in data: return data["outline"]
        if "output" in data:
            out = data["output"]
            if isinstance(out, dict):
                if "slides" in out: return out["slides"]
                if "outline" in out: return out["outline"]
            return out
    return data

def _agent_outline_to_deck(agent_obj: Any, req: OutlineRequest) -> Deck:
    def to_str(x: Any) -> str:
        return "" if x is None else str(x).strip()

    def to_bullets(x: Any) -> List[str]:
        if x is None: return []
        if isinstance(x, list): return [to_str(i) for i in x if to_str(i)]
        return [to_str(x)] if to_str(x) else []

    if isinstance(agent_obj, str):
        try: agent_obj = json.loads(agent_obj)
        except Exception: agent_obj = agent_obj.strip()

    slides_data: List[Any] = []
    if isinstance(agent_obj, list):
        slides_data = agent_obj
    elif isinstance(agent_obj, dict):
        if "slides" in agent_obj and isinstance(agent_obj["slides"], dict):
            keys_sorted = sorted(agent_obj["slides"].keys(), key=lambda x: int(re.sub(r"[^\d]", "", str(x)) or 0))
            slides_data = [agent_obj["slides"][k] for k in keys_sorted]
        elif "slides" in agent_obj and isinstance(agent_obj["slides"], list):
            slides_data = agent_obj["slides"]
        elif "outline" in agent_obj:
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
        if isinstance(node, dict):
            title = to_str(node.get("title")) or to_str(node.get("heading")) or to_str(node.get("slide_title"))
            bullets = to_bullets(node.get("bullets") or node.get("points") or node.get("items") or node.get("content"))
            if title or bullets:
                return (title or f"Slide {idx_zero+1}", bullets)
            if len(node) == 1:
                k, v = next(iter(node.items()))
                return (to_str(k) or f"Slide {idx_zero+1}", to_bullets(v))
        if isinstance(node, list):
            return (f"Slide {idx_zero+1}", to_bullets(node))
        if isinstance(node, (str, int, float)):
            return (to_str(node) or f"Slide {idx_zero+1}", [])
        return (f"Slide {idx_zero+1}", [])

    slides: List[Slide] = []
    for idx, node in enumerate(slides_data):
        title, bullets = extract_title_and_bullets(node, idx)
        slide_id = uuid.uuid4().hex
        section_dict = {"kind": "list", "id": f"{slide_id}-l1", "bullets": bullets or [], "role": "primary"}
        slides.append(Slide(
            id=slide_id, title=title or f"Slide {idx+1}",
            bullets=(bullets or None), meta=Meta(sections=[section_dict]),
            notes=None, layout="title_bullets_left", media=[],
        ))

    topic = (getattr(req, "topic", None) or "Presentation").strip() or "Presentation"
    return Deck(version=SCHEMA_VERSION, topic=topic, source=None,
                slide_count=len(slides), created_at=datetime.utcnow(), slides=slides)

# ────────────────────────────────────────────────────────────────────────────────
# Agent strategy (logs only initial request + response)
# ────────────────────────────────────────────────────────────────────────────────

@dataclass
class AgentStrategy(OutlineStrategy):
    url: str
    timeout_ms: int = settings.AGENT_TIMEOUT_MS

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        upload_id: Optional[str] = getattr(req, "upload_id", None)
        parsed_json = _load_parsed_for_upload(upload_id)
        payload = _build_agent_payload(req, parsed_json)

        rid = uuid.uuid4().hex[:8]
        url = self.url.rstrip("/") + "/outline"
        headers = {"Content-Type": "application/json"}

        async with httpx.AsyncClient(timeout=self.timeout_ms / 1000) as client:
            _dump_http("agent", rid, "request", "POST", url, headers, payload)  # initial request
            async with aspan("agent_outline_request", url=self.url, path="/outline", timeout_ms=self.timeout_ms):
                r = await client.post(url, json=payload)
            _dump_http("agent", rid, "response", "POST", url, headers, r.text, status=r.status_code)  # final response

        with span("agent_outline_response", status=r.status_code, bytes=len(r.content)): ...
        r.raise_for_status()
        data = r.json()
        outline_obj = _pick_outline_payload(data)
        return _agent_outline_to_deck(outline_obj, req)

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        upload_id: Optional[str] = getattr(req, "upload_id", None)
        parsed_json = _load_parsed_for_upload(upload_id)
        payload = _build_agent_payload(req, parsed_json)
        payload["index"] = index

        rid = uuid.uuid4().hex[:8]
        url = self.url.rstrip("/") + f"/outline/{index}/regenerate"
        headers = {"Content-Type": "application/json"}

        async with httpx.AsyncClient(timeout=self.timeout_ms / 1000) as client:
            _dump_http("agent", rid, "request", "POST", url, headers, payload)  # initial request
            async with aspan("agent_regen_request", url=self.url, path=f"/outline/{index}/regenerate",
                             index=index, timeout_ms=self.timeout_ms):
                r = await client.post(url, json=payload)
            _dump_http("agent", rid, "response", "POST", url, headers, r.text, status=r.status_code)  # final response

        with span("agent_regen_response", status=r.status_code, bytes=len(r.content), index=index): ...
        r.raise_for_status()
        data = r.json()
        outline_obj = _pick_outline_payload(data)
        if not isinstance(outline_obj, dict) or any(
            k for k in getattr(outline_obj, "keys", lambda: [])() if not str(k).lower().startswith("slide")
        ):
            outline_obj = {f"slide {index+1}": outline_obj}

        deck = _agent_outline_to_deck(outline_obj, req)
        return deck.slides[0] if deck.slides else Slide(
            id=uuid.uuid4().hex, title=f"Slide {index+1}",
            meta=Meta(sections=[ListSection(id="auto", bullets=["(empty)"], role="primary")]),
            notes=None, layout="title_bullets_left", media=[],
        )

# ────────────────────────────────────────────────────────────────────────────────
# Runpod strategy — logs initial POST (req+resp) and only the final status response
# ────────────────────────────────────────────────────────────────────────────────

@dataclass
class RunpodStrategy(OutlineStrategy):
    url: str
    timeout_ms: int = settings.AGENT_TIMEOUT_MS
    poll_interval_s: float = 1.5
    max_wait_s: Optional[int] = None

    def _headers(self) -> Dict[str, str]:
        token = (getattr(settings, "AGENT_API_KEY", None) or
                 os.getenv("RUNPOD_API_KEY") or os.getenv("AGENT_API_KEY"))
        hdrs = {"Content-Type": "application/json"}
        if token: hdrs["Authorization"] = f"Bearer {token.strip()}"
        return hdrs

    def _slides_target_from_payload(self, payload: Dict[str, Any]) -> int:
        for path in [("slide_count",), ("slides_target",), ("parsed", "slides_target")]:
            try:
                val = payload
                for key in path: val = val.get(key, {})
                n = int(val)
                if n > 0: return n
            except Exception:
                continue
        return 4

    def _wrap_input(self, payload: Dict[str, Any], rid: str) -> Dict[str, Any]:
        text = (str(payload.get("text") or "").strip())
        n = self._slides_target_from_payload(payload)
        txt_len = len(text.encode("utf-8", errors="ignore"))
        log.info("[runpod %s] minimal body text_len=%s slides_target=%s", rid, txt_len, n)
        return {"input": {"text": text, "slides_target": n}}

    async def _post_json(self, client: httpx.AsyncClient, body: Dict[str, Any], rid: str) -> Dict[str, Any]:
        headers = self._headers()
        _dump_http("runpod", rid, "request", "POST", self.url, headers, body)  # initial request
        r = await client.post(self.url, headers=headers, json=body)
        _dump_http("runpod", rid, "response", "POST", self.url, headers, r.text, status=r.status_code)  # initial resp
        with span("runpod_post_response", status=r.status_code, bytes=len(r.content)): ...
        try:
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            text = (e.response.text or "")[:400]
            raise HTTPException(502, f"Runpod POST failed: {e.response.status_code} {text}") from e
        return r.json()

    def _status_url(self, job_id: str) -> str:
        base = self.url.rstrip("/")
        if base.endswith("/run"): base = base[:-4]
        return f"{base}/status/{job_id}"

    async def _poll_status(self, client: httpx.AsyncClient, job_id: str, rid: str) -> Dict[str, Any]:
        deadline = (self.max_wait_s or int(self.timeout_ms / 1000))
        waited = 0.0
        status_url, headers = self._status_url(job_id), self._headers()
        while True:
            r = await client.get(status_url, headers=headers)
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as e:
                # log the final error response once
                try:
                    _dump_http("runpod", rid, "response", "GET", status_url, headers, e.response.text, status=e.response.status_code)
                except Exception:
                    pass
                text = (e.response.text or "")[:400]
                raise HTTPException(502, f"Runpod status failed: {e.response.status_code} {text}") from e
            js = r.json()
            status = (js.get("status") or "").upper()
            if status in {"COMPLETED", "SUCCEEDED", "SUCCESS"}:
                # log ONLY the final completed response
                _dump_http("runpod", rid, "response", "GET", status_url, headers, r.text, status=r.status_code)
                return js
            if status in {"FAILED", "CANCELLED", "CANCELED", "ERROR"}:
                _dump_http("runpod", rid, "response", "GET", status_url, headers, r.text, status=r.status_code)
                raise HTTPException(502, f"Runpod job failed: {js}")
            await asyncio.sleep(self.poll_interval_s)
            waited += self.poll_interval_s
            if waited >= deadline:
                # nothing to log here (no final HTTP response)
                raise HTTPException(504, f"Runpod job timed out after {deadline}s")

    async def _invoke(self, payload: Dict[str, Any]) -> Any:
        rid = uuid.uuid4().hex[:8]
        body = self._wrap_input(payload, rid=rid)
        timeout_s = max(5, int(self.timeout_ms / 1000))
        async with httpx.AsyncClient(timeout=timeout_s) as client:
            if self.url.rstrip("/").endswith("/runsync"):
                async with aspan("runpod_runsync_call", url=self.url, timeout_s=timeout_s):
                    js = await self._post_json(client, body, rid=rid)
                return js.get("output", js)
            else:
                async with aspan("runpod_run_call", url=self.url, timeout_s=timeout_s):
                    js = await self._post_json(client, body, rid=rid)
                job_id = js.get("id") or js.get("jobId") or js.get("requestId")
                if not job_id: return js.get("output", js)
                async with aspan("runpod_poll_status", job_id=job_id):
                    st = await self._poll_status(client, job_id, rid=rid)
                return st.get("output", st)

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        upload_id: Optional[str] = getattr(req, "upload_id", None)
        parsed_json = _load_parsed_for_upload(upload_id)
        payload = _build_agent_payload(req, parsed_json)
        data = await self._invoke(payload)
        outline_obj = _pick_outline_payload(data)
        return _agent_outline_to_deck(outline_obj, req)

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        upload_id: Optional[str] = getattr(req, "upload_id", None)
        parsed_json = _load_parsed_for_upload(upload_id)
        payload = _build_agent_payload(req, parsed_json)
        payload["index"] = index
        data = await self._invoke(payload)
        outline_obj = _pick_outline_payload(data)
        if not isinstance(outline_obj, dict) or any(
            k for k in getattr(outline_obj, "keys", lambda: [])() if not str(k).lower().startswith("slide")
        ):
            outline_obj = {f"slide {index+1}": outline_obj}
        deck = _agent_outline_to_deck(outline_obj, req)
        return deck.slides[0] if deck.slides else Slide(
            id=uuid.uuid4().hex, title=f"Slide {index+1}",
            meta=Meta(sections=[ListSection(id="auto", bullets=["(empty)"], role="primary")]),
            notes=None, layout="title_bullets_left", media=[],
        )

# ────────────────────────────────────────────────────────────────────────────────
# OutlineService
# ────────────────────────────────────────────────────────────────────────────────

def _make_title_slide(title: str) -> Slide:
    # Hard-code title layout — no auto-detection or validation
    return Slide(
        id=uuid.uuid4().hex,
        title=(title or "Presentation").strip() or "Presentation",
        meta=Meta(sections=[]),
        notes=None,
        layout="title_only",
        media=[],
    )

@dataclass
class OutlineService:
    primary: OutlineStrategy
    fallback: OutlineStrategy
    _img_provider = None

    def _provider(self):
        if self._img_provider is None:
            self._img_provider = build_image_provider()
        return self._img_provider

    async def _enrich_images(self, deck: Deck) -> Deck:
        if not settings.FEATURE_IMAGE_API: return deck
        provider = self._provider()
        provider_name = provider.__class__.__name__
        async with aspan("image_enrich_deck", slides=len(deck.slides), provider=provider_name):
            for idx, s in enumerate(deck.slides):
                if idx == 0:   # don't add images to the title slide
                    continue
                if getattr(s, "media", None) and len(s.media) > 0:
                    continue
                kw = _kw_from_title(s.title, deck.topic)
                async with aspan("image_enrich_slide", idx=idx, kw=kw):
                    try:
                        media = await provider.image_for(kw, idx)
                        if media: s.media = [media]
                    except Exception as e:
                        log.warning("image_enrich_error idx=%s kw=%s: %s", idx, kw, e)
        return deck

    async def _auto_fit_layouts(self, deck: Deck) -> Deck:
        """
        Assign layouts to non-title slides. We leave slide 0 as-is ("title_only").
        """
        if not deck or not getattr(deck, "slides", None):
            return deck

        default_first = _first_layout_id()
        top_k = max(1, int(getattr(settings, "LAYOUT_AUTOFIT_TOPK", 3) or 3))

        cand_cache: dict[tuple[int, int], list[str]] = {}
        rr_index: dict[tuple[int, int], int] = {}

        for i, s in enumerate(deck.slides):
            if i == 0:
                continue  # never touch the title slide
            try:
                text_count = _count_text_blocks_server(s)
                image_count = max(0, len(getattr(s, "media", None) or []))
                key = (text_count, image_count)

                if key not in cand_cache:
                    cands = choose_layouts({"text_count": text_count, "image_count": image_count}, top_k=top_k)
                    cand_cache[key] = [str(cid) for cid in (cands or [])]
                    rr_index[key] = 0

                cands = cand_cache[key]
                chosen = (cands[rr_index[key] % len(cands)] if cands else None)
                rr_index[key] += 1 if cands else 0

                s.layout = chosen or _heuristic_layout_id(text_count, image_count, default_first)

            except Exception as e:
                log.warning("autofit failed for slide %s: %s", getattr(s, "id", "?"), e)
                s.layout = _heuristic_layout_id(
                    _count_text_blocks_server(s),
                    max(0, len(getattr(s, "media", None) or [])),
                    default_first,
                )
        return deck

    async def _auto_fit_slide(self, slide: Slide) -> Slide:
        """
        Assign a layout to a single slide. (Never used for title slide.)
        """
        default_first = _first_layout_id()
        try:
            text_count = _count_text_blocks_server(slide)
            image_count = max(0, len(getattr(slide, "media", None) or []))
            top_k = max(1, int(getattr(settings, "LAYOUT_AUTOFIT_TOPK", 3) or 3))
            cands = choose_layouts({"text_count": text_count, "image_count": image_count}, top_k=top_k) or []

            chosen = None
            if cands:
                sid = str(getattr(slide, "id", "")) or "0"
                idx = (abs(hash(sid)) % len(cands)) if len(cands) > 0 else 0
                chosen = str(cands[idx])

            slide.layout = chosen or _heuristic_layout_id(text_count, image_count, default_first)
        except Exception:
            slide.layout = _heuristic_layout_id(
                _count_text_blocks_server(slide),
                max(0, len(getattr(slide, "media", None) or [])),
                default_first,
            )
        return slide

    async def generate_deck(self, req: OutlineRequest) -> Deck:
        """
        Keep total slide count equal to the user's request by asking the model
        for N-1 slides, then prepending a title slide ("title_only").
        """
        desired_total = max(1, min(int(getattr(req, "slide_count", 4) or 4), 15))
        gen_count = max(0, desired_total - 1)

        if gen_count == 0:
            topic = (getattr(req, "topic", None) or "Presentation").strip() or "Presentation"
            deck = Deck(
                version=SCHEMA_VERSION,
                topic=topic,
                source=None,
                slide_count=1,
                created_at=datetime.utcnow(),
                slides=[_make_title_slide(topic)],
            )
        else:
            try:
                try:
                    req2 = req.model_copy(update={"slide_count": gen_count})  # pydantic v2
                except Exception:
                    try:
                        req2 = OutlineRequest(**{**req.dict(), "slide_count": gen_count})  # pydantic v1
                    except Exception:
                        req2 = OutlineRequest(topic=getattr(req, "topic", None),
                                              text=getattr(req, "text", None),
                                              slide_count=gen_count)

                async with aspan("outline_generate", strategy=self.primary.__class__.__name__):
                    log.info("[outline] using primary=%s", self.primary.__class__.__name__)
                    deck = await self.primary.generate_deck(req2)
            except Exception as e:
                log.warning("outline primary failed; %s", f"{type(e).__name__}: {str(e)[:200]}", exc_info=True)
                if not getattr(settings, "ALLOW_OUTLINE_FALLBACK", True):
                    raise
                async with aspan("outline_generate_fallback", strategy=self.fallback.__class__.__name__):
                    if hasattr(req, "model_copy"):
                        req2 = req.model_copy(update={"slide_count": gen_count})
                    else:
                        req2 = OutlineRequest(topic=getattr(req, "topic", None),
                                              text=getattr(req, "text", None),
                                              slide_count=gen_count)
                    deck = await self.fallback.generate_deck(req2)

            # Prepend title and clamp to desired_total
            topic = (getattr(req, "topic", None) or deck.topic or "Presentation").strip() or "Presentation"
            deck.slides = [_make_title_slide(topic), *deck.slides][:desired_total]
            deck.slide_count = len(deck.slides)
            deck.topic = topic

        # Rest of the pipeline unchanged
        deck = await self._enrich_images(deck)
        deck = await self._auto_fit_layouts(deck)
        return deck

    async def regenerate_slide(self, index: int, req: OutlineRequest) -> Slide:
        try:
            async with aspan("outline_regenerate", strategy=self.primary.__class__.__name__, index=index):
                log.info("[outline] regen using primary=%s", self.primary.__class__.__name__)
                slide = await self.primary.regenerate_slide(index, req)
        except Exception as e:
            log.warning("outline regen primary failed; %s", f"{type(e).__name__}: {str(e)[:200]}", exc_info=True)
            if not getattr(settings, "ALLOW_OUTLINE_FALLBACK", True):
                raise
            async with aspan("outline_regenerate_fallback", strategy=self.fallback.__class__.__name__, index=index):
                slide = await self.fallback.regenerate_slide(index, req)

        if settings.FEATURE_IMAGE_API:
            provider = self._provider()
            kw = _kw_from_title(getattr(slide, "title", None), getattr(req, "topic", None))
            async with aspan("image_enrich_slide", idx=index, kw=kw):
                try:
                    media = await provider.image_for(kw, index)
                    if media: slide.media = [media]
                except Exception as e:
                    log.warning("image_enrich_error idx=%s kw=%s: %s", index, kw, e)
        slide = await self._auto_fit_slide(slide)
        return slide

# ────────────────────────────────────────────────────────────────────────────────
# Builder
# ────────────────────────────────────────────────────────────────────────────────

def build_outline_service() -> OutlineService:
    if settings.FEATURE_USE_MODEL and settings.AGENT_URL:  # type: ignore[truthy-bool]
        host = urllib.parse.urlparse(settings.AGENT_URL).hostname or ""
        if "api.runpod.ai" in host:
            log.info("[outline] using RunpodStrategy url=%s", settings.AGENT_URL)
            return OutlineService(
                primary=RunpodStrategy(
                    url=settings.AGENT_URL,
                    timeout_ms=settings.AGENT_TIMEOUT_MS,
                    poll_interval_s=1.5,
                    max_wait_s=getattr(settings, "RUNPOD_MAX_WAIT_S", None),
                ),
                fallback=PlaceholderStrategy(),
            )
        log.info("[outline] using AgentStrategy url=%s", settings.AGENT_URL)
        return OutlineService(
            primary=AgentStrategy(url=settings.AGENT_URL, timeout_ms=settings.AGENT_TIMEOUT_MS),
            fallback=PlaceholderStrategy(),
        )
    log.info("[outline] using PlaceholderStrategy (no model)")
    return OutlineService(primary=PlaceholderStrategy(), fallback=PlaceholderStrategy())
