import time
import uuid
import logging
import os
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.telemetry import request_id_ctx, server_timing_ctx

log = logging.getLogger("http")


class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex

        # make available to handlers
        request.state.request_id = request_id
        request.state.t_start = start

        # set context vars ONCE and capture tokens
        rid_token = request_id_ctx.set(request_id)
        st_token = server_timing_ctx.set([])  # spans will append here

        try:
            response = await call_next(request)

            duration_ms = int((time.perf_counter() - start) * 1000)

            # headers for correlation + devtools timing
            response.headers["x-request-id"] = request_id
            response.headers["x-response-time-ms"] = str(duration_ms)

            # add overall app time to any per-span timings
            timings = server_timing_ctx.get() or []
            # You can keep "app" or use "total"; both are fine.
            timings.append(f"app;dur={duration_ms}")

            # merge with any existing Server-Timing
            prev = response.headers.get("Server-Timing")
            merged = ", ".join(timings) if not prev else f"{prev}, {', '.join(timings)}"
            response.headers["Server-Timing"] = merged

            expose_need = ["Server-Timing", "X-Request-Id", "X-Response-Time-Ms"]
            existing_expose = response.headers.get("Access-Control-Expose-Headers", "")
            existing_tokens = {t.strip().lower() for t in existing_expose.split(",") if t.strip()}
            merged_tokens = list({*existing_tokens, *[h.lower() for h in expose_need]})
            if merged_tokens:
                # preserve canonical casing when writing
                final_list = []
                for t in merged_tokens:
                    if t == "server-timing":
                        final_list.append("Server-Timing")
                    elif t == "x-request-id":
                        final_list.append("X-Request-Id")
                    elif t == "x-response-time-ms":
                        final_list.append("X-Response-Time-Ms")
                    else:
                        final_list.append(t)
                response.headers["Access-Control-Expose-Headers"] = ", ".join(final_list)

            tao = os.getenv("TIMING_ALLOW_ORIGIN", "*")
            if tao:
                response.headers.setdefault("Timing-Allow-Origin", tao)

            level = logging.DEBUG if request.url.path.endswith("/health") else logging.INFO
            log.log(
                level,
                "request_complete",
                extra={
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
                },
            )
            return response

        except Exception:
            duration_ms = int((time.perf_counter() - start) * 1000)
            log.exception(
                "unhandled_error",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "route": getattr(request.scope.get("route"), "path", None),
                    "handler": getattr(request.scope.get("endpoint"), "__name__", None),
                    "status_code": 500,
                    "duration_ms": duration_ms,
                    "client_ip": request.client.host if request.client else None,
                    "user_agent": request.headers.get("user-agent"),
                },
            )
            raise

        finally:
            # reset exactly once
            try:
                request_id_ctx.reset(rid_token)
            finally:
                server_timing_ctx.reset(st_token)
