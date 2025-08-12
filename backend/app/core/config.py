# backend/app/core/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from pathlib import Path

# Resolve the backend project root (…/backend)
BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    ENV: str = "local"
    DEBUG: bool = True

    # Single API base
    API_BASE: str = "/v1"

    # CORS for Vite + fallback ports
    ALLOW_ALL_CORS: bool = False
    CORS_ALLOW_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    STORAGE_DIR: Path = BACKEND_ROOT / "data" / "uploads"
    MAX_UPLOAD_MB: int = 20

    # Retention knobs (from earlier)
    ENABLE_RETENTION: bool = True
    RETENTION_DAYS: int = 7
    RETENTION_SWEEP_MINUTES: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()
