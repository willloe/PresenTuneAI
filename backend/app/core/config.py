from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from pathlib import Path

class Settings(BaseSettings):
    # Env / debugging
    ENV: str = "local"
    DEBUG: bool = True

    API_BASE: str = "/v1"

    # Allow both React/Vite defaults
    CORS_ALLOW_ORIGINS: List[str] = [
        "http://localhost:5173", "http://127.0.0.1:5173",
        "http://localhost:3000", "http://127.0.0.1:3000",
    ]

    # Storage & uploads
    STORAGE_DIR: Path = Path("data/uploads")
    MAX_UPLOAD_MB: int = 20

    # (Optional) simple bearer auth toggle
    AUTH_ENABLED: bool = False
    API_TOKEN: str = "dev-token"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

settings = Settings()
