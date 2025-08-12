from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import contextlib
import logging
from datetime import timedelta

from app.core.config import settings
from app.core.logging import setup_logging

from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.upload import router as upload_router
from app.api.v1.endpoints.outline import router as outline_router
from app.api.v1.endpoints.export import router as export_router
from app.api.v1.endpoints.ops import router as ops_router
from app.api.v1.endpoints.schema import router as schema_router
from app.middleware.observability import ObservabilityMiddleware
from app.services.storage_service import purge_old_files

logger = logging.getLogger("retention")


def create_app() -> FastAPI:
    setup_logging()
    app = FastAPI(
        title="PresenTuneAI API",
        version="0.1.0",
        docs_url="/docs",
        openapi_url="/openapi.json",
    )

    # CORS
    allow_origins = ["*"] if settings.ALLOW_ALL_CORS else settings.CORS_ALLOW_ORIGINS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["x-request-id", "x-response-time-ms", "Server-Timing"],
    )
    app.add_middleware(ObservabilityMiddleware)

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

    # Ensure local storage exists
    @app.on_event("startup")
    def _ensure_storage():
        settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    # Mount v1 routes under a single, configurable prefix
    API_PREFIX = settings.API_BASE
    app.include_router(health_router, prefix=API_PREFIX)
    app.include_router(upload_router, prefix=API_PREFIX)
    app.include_router(outline_router, prefix=API_PREFIX)
    app.include_router(export_router, prefix=API_PREFIX)
    app.include_router(schema_router, prefix=API_PREFIX)
    app.include_router(ops_router, prefix=API_PREFIX)

    # Background retention loop
    async def _retention_loop():
        interval = max(1, settings.RETENTION_SWEEP_MINUTES) * 60
        ttl = timedelta(days=max(0, settings.RETENTION_DAYS))
        while True:
            try:
                removed = purge_old_files(settings.STORAGE_DIR, ttl)
                if removed:
                    logger.info("retention: deleted %d file(s)", len(removed))
            except Exception:
                logger.exception("retention sweep crashed")
            await asyncio.sleep(interval)

    @app.on_event("startup")
    async def _start_retention():
        if settings.ENABLE_RETENTION:
            app.state.retention_task = asyncio.create_task(_retention_loop())

    @app.on_event("shutdown")
    async def _stop_retention():
        task = getattr(app.state, "retention_task", None)
        if task:
            task.cancel()
            with contextlib.suppress(Exception):
                await task

    return app


app = create_app()
