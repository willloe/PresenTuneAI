from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncio, contextlib, logging
from datetime import timedelta

from app.core.config import settings
from app.core.logging import setup_logging

from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.upload import router as upload_router
from app.api.v1.endpoints.outline import router as outline_router
from app.api.v1.endpoints.export import router as export_router
from app.api.v1.endpoints import ops as ops_router  # manual retention sweep
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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ALLOW_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Ensure local storage exists
    @app.on_event("startup")
    def _ensure_storage():
        settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)

    # Mount v1 routes under a single, configurable prefix
    API_PREFIX = settings.API_BASE
    app.include_router(health_router,  prefix=API_PREFIX)
    app.include_router(upload_router,  prefix=API_PREFIX)
    app.include_router(outline_router, prefix=API_PREFIX)
    app.include_router(export_router,  prefix=API_PREFIX)
    app.include_router(ops_router.router, prefix=API_PREFIX)

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
