from __future__ import annotations
import time, logging
from contextlib import contextmanager, asynccontextmanager
from contextvars import ContextVar
from typing import Optional

# Context set/reset by ObservabilityMiddleware
request_id_ctx: ContextVar[Optional[str]] = ContextVar("request_id", default=None)
server_timing_ctx: ContextVar[Optional[list[str]]] = ContextVar("server_timing", default=None)

_perf_log = logging.getLogger("perf")

# All LogRecord attribute names that must NOT appear in `extra`
_RESERVED: set[str] = {
    "name","msg","args","levelname","levelno","pathname","filename","module",
    "exc_info","exc_text","stack_info","lineno","funcName","created","msecs",
    "relativeCreated","thread","threadName","processName","process","message"
}

def _sanitize_fields(fields: dict) -> dict:
    """Prefix reserved LogRecord keys to avoid collisions."""
    if not fields:
        return {}
    out = {}
    for k, v in fields.items():
        out[(f"meta_{k}" if k in _RESERVED else k)] = v
    return out

def _emit(name: str, duration_ms: int, logger: Optional[logging.Logger], **fields):
    """Internal: emit a perf span log and enqueue Server-Timing entry if available."""
    log = logger or _perf_log
    safe_fields = _sanitize_fields(fields)
    payload = {"span": name, "duration_ms": duration_ms} | safe_fields

    rid = request_id_ctx.get()
    if rid:
        payload["request_id"] = rid

    # Add to Server-Timing so it shows in browser DevTools
    st = server_timing_ctx.get()
    if st is not None:
        st.append(f"{name};dur={duration_ms}")

    log.info("span", extra=payload)

@contextmanager
def span(name: str, logger: Optional[logging.Logger] = None, **fields):
    t0 = time.perf_counter()
    try:
        yield
    finally:
        _emit(name, int((time.perf_counter() - t0) * 1000), logger, **fields)

@asynccontextmanager
async def aspan(name: str, logger: Optional[logging.Logger] = None, **fields):
    t0 = time.perf_counter()
    try:
        yield
    finally:
        _emit(name, int((time.perf_counter() - t0) * 1000), logger, **fields)
