# backend/app/core/config.py
from __future__ import annotations

from typing import List, Optional, Literal
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the backend project root (…/backend)
BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Centralized runtime configuration.

    Loads from environment (see .env / platform env), with safe defaults for local dev.
    """

    # ─────────────────────────── Runtime ───────────────────────────
    ENV: str = "local"
    DEBUG: bool = True

    # API mount prefix
    API_BASE: str = "/v1"

    # ─────────────────────────── Auth (optional, Week 2) ──────────
    # If enabled, mutation endpoints require: Authorization: Bearer <API_TOKEN>
    AUTH_ENABLED: bool = False
    API_TOKEN: str = "dev-token"

    # ─────────────────────────── CORS ──────────────────────────────
    # If true, allow all origins. Otherwise restrict to CORS_ALLOW_ORIGINS.
    ALLOW_ALL_CORS: bool = False
    # Accept JSON array string or comma-separated list (pydantic will split)
    CORS_ALLOW_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # ─────────────────────────── Storage / Uploads ─────────────────
    STORAGE_DIR: Path = BACKEND_ROOT / "data" / "uploads"
    MAX_UPLOAD_MB: int = 20

    # ─────────────────────────── Retention (housekeeping) ──────────
    ENABLE_RETENTION: bool = True
    RETENTION_DAYS: int = 7
    RETENTION_SWEEP_MINUTES: int = 30

    # ─────────────────────────── Outline strategy (Week 2) ─────────
    # If true, use the external Agent service; otherwise use placeholder strategy.
    FEATURE_USE_MODEL: bool = False
    AGENT_URL: str = "http://agent:8001"
    AGENT_TIMEOUT_MS: int = 10_000  # http timeout for agent calls

    # ─────────────────────────── Image enrichment (Week 2) ─────────
    FEATURE_IMAGE_API: bool = True
    IMAGE_PROVIDER: Literal["stub", "pexels"] = "stub"
    PEXELS_API_KEY: Optional[str] = None  # required only when IMAGE_PROVIDER="pexels"

    # ─────────────────────────── Observability ─────────────────────
    # Controls whether browsers can read Server-Timing across origins.
    TIMING_ALLOW_ORIGIN: str = "*"

    # pydantic-settings configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # env_prefix="",
        # env_nested_delimiter="__",
    )

    # ─────────────────────────── Validators / Normalizers ──────────
    @field_validator("STORAGE_DIR", mode="before")
    @classmethod
    def _abs_storage_dir(cls, v: Path | str) -> Path:
        """Make STORAGE_DIR absolute and under BACKEND_ROOT if a relative path is provided."""
        p = Path(v)
        return p if p.is_absolute() else (BACKEND_ROOT / p).resolve()

    @field_validator("MAX_UPLOAD_MB")
    @classmethod
    def _positive_upload_cap(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("MAX_UPLOAD_MB must be > 0")
        return v

    @field_validator("AGENT_URL")
    @classmethod
    def _trim_agent_url(cls, v: str) -> str:
        return (v or "").strip()

    @model_validator(mode="after")
    def _auth_require_token(self) -> "Settings":
        # Guard: if auth is enabled, token must be non-empty
        if self.AUTH_ENABLED and not (self.API_TOKEN and self.API_TOKEN.strip()):
            raise ValueError("AUTH_ENABLED=true requires API_TOKEN to be set.")
        return self


settings = Settings()
