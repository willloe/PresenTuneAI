from __future__ import annotations

from typing import List, Optional, Literal
from pathlib import Path
import shutil
import os

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Backend project root (…/backend)
BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """
    Centralized runtime configuration.
    Values load from environment (.env or platform env) with sensible local defaults.
    """

    # ── Runtime ──────────────────────────────────────────────────────────────────
    ENV: str = "local"
    DEBUG: bool = True

    # API mount prefix (e.g., "/v1")
    API_BASE: str = "/v1"

    # ── Auth (optional) ──────────────────────────────────────────────────────────
    AUTH_ENABLED: bool = False
    API_TOKEN: str = "dev-token"

    # ── CORS ─────────────────────────────────────────────────────────────────────
    ALLOW_ALL_CORS: bool = False
    CORS_ALLOW_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # ── Storage / Uploads ────────────────────────────────────────────────────────
    STORAGE_DIR: Path = BACKEND_ROOT / "data" / "uploads"
    MAX_UPLOAD_MB: int = 20

    # ── Retention (housekeeping) ─────────────────────────────────────────────────
    ENABLE_RETENTION: bool = True
    RETENTION_DAYS: int = 7
    RETENTION_SWEEP_MINUTES: int = 30

    # ── Outline / Agent (optional) ───────────────────────────────────────────────
    FEATURE_USE_MODEL: bool = False
    AGENT_URL: str = "http://agent:8001"
    AGENT_API_KEY: Optional[str] = None
    # Per-request HTTP client timeout (ms)
    AGENT_TIMEOUT_MS: int = 10_000

    # Runpod-specific
    RUNPOD_INPUT_MODE: Literal["wrap", "passthrough"] = "wrap"
    RUNPOD_API_KEY: Optional[str] = None
    # Total time to poll a Runpod job before giving up (seconds)
    RUNPOD_MAX_WAIT_S: int = 600
    # Whether to fall back to PlaceholderStrategy on failures/timeouts
    ALLOW_OUTLINE_FALLBACK: bool = True

    # ── Layout selection ─────────────────────────────────────────────────────────
    # Server-side auto-layout will consider top-K candidates (round-robin / hashed)
    LAYOUT_AUTOFIT_TOPK: int = 3

    # ── Image enrichment / generation ────────────────────────────────────────────
    FEATURE_IMAGE_API: bool = True
    # "stub" (picsum), "pexels" (free stock), "openai"/"gpt"/"gpt-image" (paid)
    IMAGE_PROVIDER: Literal["stub", "pexels", "openai", "gpt", "gpt-image"] = "stub"

    # Pexels
    PEXELS_API_KEY: Optional[str] = None

    # OpenAI (gpt-image-1)
    OPENAI_API_KEY: Optional[str] = None
    IMAGE_OPENAI_MODEL: str = "gpt-image-1"   # name kept for env/back-compat
    IMAGE_OPENAI_STYLE: Optional[str] = None  # "photo" | "illustration" | "diagram" | "icon"

    # ── Figures extraction ───────────────────────────────────────────────────────
    USE_PDFFIGURES2: bool = True
    PDFFIGURES2_BIN: Optional[str] = "/usr/local/bin/pdffigures2"

    # ── Observability ────────────────────────────────────────────────────────────
    TIMING_ALLOW_ORIGIN: str = "*"

    # ── Parsing (GROBID) ────────────────────────────────────────────────────────
    GROBID_ENABLED: bool = True
    # e.g. "http://grobid:8070" in docker-compose; "http://localhost:8070" locally
    GROBID_URL: Optional[str] = "http://grobid:8070"
    GROBID_TIMEOUT: int = 30  # seconds

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # ── Validators / Normalizers ─────────────────────────────────────────────────

    @field_validator("STORAGE_DIR", mode="before")
    @classmethod
    def _abs_storage_dir(cls, v: Path | str) -> Path:
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

    @field_validator("API_BASE")
    @classmethod
    def _normalize_api_base(cls, v: str) -> str:
        v = (v or "").strip()
        if not v.startswith("/"):
            v = "/" + v
        return v.rstrip("/") or "/v1"

    @field_validator("IMAGE_OPENAI_STYLE")
    @classmethod
    def _clean_openai_style(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        return v.strip() or None

    # Normalize RUNPOD_INPUT_MODE (case-insensitive)
    @field_validator("RUNPOD_INPUT_MODE", mode="before")
    @classmethod
    def _normalize_runpod_input_mode(cls, v: str) -> str:
        v = (v or "wrap").strip().lower()
        return "passthrough" if v == "passthrough" else "wrap"

    # NEW: basic guards for timeouts and tunables
    @field_validator("AGENT_TIMEOUT_MS")
    @classmethod
    def _positive_agent_timeout(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("AGENT_TIMEOUT_MS must be > 0")
        return v

    @field_validator("RUNPOD_MAX_WAIT_S")
    @classmethod
    def _positive_runpod_wait(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("RUNPOD_MAX_WAIT_S must be > 0")
        return v

    @field_validator("LAYOUT_AUTOFIT_TOPK")
    @classmethod
    def _layout_topk_guard(cls, v: int) -> int:
        return max(1, v)

    # NEW: normalize GROBID_URL (strip/ensure scheme/remove trailing slash)
    @field_validator("GROBID_URL")
    @classmethod
    def _normalize_grobid_url(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        v = v.strip().rstrip("/")
        if not (v.startswith("http://") or v.startswith("https://")):
            v = "http://" + v
        return v

    # NEW: guard timeout
    @field_validator("GROBID_TIMEOUT")
    @classmethod
    def _positive_timeout(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("GROBID_TIMEOUT must be > 0")
        return v

    @model_validator(mode="after")
    def _auth_require_token(self) -> "Settings":
        if self.AUTH_ENABLED and not (self.API_TOKEN and self.API_TOKEN.strip()):
            raise ValueError("AUTH_ENABLED=true requires API_TOKEN to be set.")
        return self

    @model_validator(mode="after")
    def _pdffigures2_required_when_enabled(self) -> "Settings":
        if self.USE_PDFFIGURES2:
            bin_path = (self.PDFFIGURES2_BIN or "").strip()
            found = bin_path if bin_path and Path(bin_path).exists() else shutil.which("pdffigures2")
            if not found:
                raise ValueError(
                    "USE_PDFFIGURES2=true but pdffigures2 is not available. "
                    "Set PDFFIGURES2_BIN or ensure it's on PATH."
                )
            self.PDFFIGURES2_BIN = str(Path(found).resolve())
            os.environ.setdefault("PDFFIGURES2_BIN", self.PDFFIGURES2_BIN)
        return self

    @model_validator(mode="after")
    def _image_provider_requirements(self) -> "Settings":
        prov = (self.IMAGE_PROVIDER or "stub").lower()
        if self.FEATURE_IMAGE_API and prov in {"openai", "gpt", "gpt-image"}:
            if not (self.OPENAI_API_KEY and self.OPENAI_API_KEY.strip()):
                raise ValueError("IMAGE_PROVIDER=openai requires OPENAI_API_KEY to be set.")
        if self.FEATURE_IMAGE_API and prov == "pexels":
            if not (self.PEXELS_API_KEY and self.PEXELS_API_KEY.strip()):
                raise ValueError("IMAGE_PROVIDER=pexels requires PEXELS_API_KEY to be set.")
        return self

    # only require URL if enabled (don’t ping at startup to keep boot fast)
    @model_validator(mode="after")
    def _grobid_requirements(self) -> "Settings":
        if self.GROBID_ENABLED and not self.GROBID_URL:
            raise ValueError("GROBID_ENABLED=true requires GROBID_URL to be set.")
        return self


settings = Settings()
