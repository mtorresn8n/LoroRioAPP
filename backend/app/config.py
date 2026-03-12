import secrets as _secrets

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator
import json


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    DATABASE_URL: str = "postgresql+asyncpg://loroapp:loroapp@db:5432/loroapp"
    MEDIA_PATH: str = "/app/media"
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:80", "http://localhost:8000"]

    # Auth settings
    AUTH_USER: str = ""
    AUTH_PASS: str = ""
    AUTH_SECRET: str = ""
    AUTH_MAX_AGE_DAYS: int = 30

    # AI API Keys are stored in user_settings DB table, configured via UI

    @model_validator(mode="after")
    def _generate_auth_secret(self) -> "Settings":
        if not self.AUTH_SECRET:
            object.__setattr__(self, "AUTH_SECRET", _secrets.token_hex(32))
        return self

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
            return [parsed]
        return value


settings = Settings()
