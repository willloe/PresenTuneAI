from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    ENV: str = "local"
    DEBUG: bool = True
    CORS_ALLOW_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    STORAGE_DIR: str = "data/uploads"  # local dev storage
    MAX_UPLOAD_MB: int = 20

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()
