import time, logging, uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

log = logging.getLogger("http")

class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex

        # expose to handlers
        request.state.request_id = request_id
        request.state.t_start = start

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = int((time.perf_counter() - start) * 1000)
            log.exception("unhandled_error", extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "route": getattr(request.scope.get("route"), "path", None),
                "handler": getattr(request.scope.get("endpoint"), "__name__", None),
                "status_code": 500,
                "duration_ms": duration_ms,
                "client_ip": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent"),
            })
            raise

        duration_ms = int((time.perf_counter() - start) * 1000)

        # response correlation + browser-friendly timing
        response.headers["x-request-id"] = request_id
        response.headers["x-response-time-ms"] = str(duration_ms)
        # Server-Timing is handy in DevTools
        prev_st = response.headers.get("Server-Timing")
        server_timing = f"app;dur={duration_ms}"
        response.headers["Server-Timing"] = f"{prev_st}, {server_timing}" if prev_st else server_timing

        # healthcheck logs at DEBUG to reduce noise
        level = logging.DEBUG if request.url.path.endswith("/health") else logging.INFO

        log.log(level, "request_complete", extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "route": getattr(request.scope.get("route"), "path", None),
            "handler": getattr(request.scope.get("endpoint"), "__name__", None),
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "bytes_out": response.headers.get("content-length"),
            "client_ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
        })
        return response
