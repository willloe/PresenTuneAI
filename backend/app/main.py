# backend/app/main.py
from __future__ import annotations

import asyncio
import contextlib
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request, APIRouter
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.logging import setup_logging
from app.middleware.observability import ObservabilityMiddleware

# v1 endpoints
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.upload import router as upload_router
from app.api.v1.endpoints.outline import router as outline_router
from app.api.v1.endpoints.export import router as export_router
from app.api.v1.endpoints.layouts import router as layouts_router
from app.api.v1.endpoints.editor import router as editor_router
from app.api.v1.endpoints.ops import router as ops_router
from app.api.v1.endpoints.schema import router as schema_router

# background worker
from app.workers.retention import retention_loop

log_retention = logging.getLogger("retention")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── startup ─────────────────────────────────────────────────────
    setup_logging()

    # Ensure local storage exists
    settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    # Start background retention task (worker exits early if disabled)
    retention_task: asyncio.Task | None = asyncio.create_task(retention_loop())

    try:
        yield
    finally:
        # ── shutdown ────────────────────────────────────────────────
        if retention_task:
            retention_task.cancel()
            with contextlib.suppress(Exception):
                await retention_task


def create_app() -> FastAPI:
    app = FastAPI(
        title="PresenTuneAI API",
        version="0.2.0",
        docs_url="/docs",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # CORS (expose perf/correlation headers to browser DevTools)
    allow_origins = ["*"] if settings.ALLOW_ALL_CORS else settings.CORS_ALLOW_ORIGINS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id", "X-Response-Time-Ms", "Server-Timing"],
    )

    # Observability (x-request-id, Server-Timing aggregation)
    app.add_middleware(ObservabilityMiddleware)

    # Uniform JSON error shape + request id propagation
    @app.exception_handler(StarletteHTTPException)
    async def http_exc_handler(request: Request, exc: StarletteHTTPException):
        rid = getattr(getattr(request, "state", None), "request_id", None)
        headers = {"x-request-id": rid} if rid else {}
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail, "request_id": rid},
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exc_handler(request: Request, exc: RequestValidationError):
        rid = getattr(getattr(request, "state", None), "request_id", None)
        headers = {"x-request-id": rid} if rid else {}
        return JSONResponse(
            status_code=422,
            content={"detail": exc.errors(), "request_id": rid},
            headers=headers,
        )

    @app.exception_handler(Exception)
    async def unhandled_exc_handler(request: Request, exc: Exception):
        rid = getattr(getattr(request, "state", None), "request_id", None)
        headers = {"x-request-id": rid} if rid else {}
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal Server Error", "request_id": rid},
            headers=headers,
        )

    # Mount v1 routers under a single configurable prefix
    api = APIRouter(prefix=settings.API_BASE)
    api.include_router(health_router)
    api.include_router(upload_router)
    api.include_router(outline_router)
    api.include_router(export_router)
    api.include_router(schema_router)
    api.include_router(ops_router)
    api.include_router(layouts_router)
    api.include_router(editor_router)
    app.include_router(api)

    return app


app = create_app()
