from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
import json


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    DATABASE_URL: str = "postgresql+asyncpg://loroapp:loroapp@db:5432/loroapp"
    MEDIA_PATH: str = "/app/media"
    CORS_ORIGINS: list[str] = ["*"]

    # AI API Keys are stored in user_settings DB table, configured via UI

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
