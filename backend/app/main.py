from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import setup_logging
from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.upload import router as upload_router
from app.api.v1.endpoints.outline import router as outline_router
from app.api.v1.endpoints.export import router as export_router

def create_app() -> FastAPI:
    setup_logging()
    app = FastAPI(title="PresenTuneAI API", version="0.1.0", docs_url="/docs", openapi_url="/openapi.json")

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

    return app

app = create_app()
