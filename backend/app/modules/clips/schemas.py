import uuid
from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl, field_validator


class ClipBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: str = Field(default="sound", pattern="^(sound|word|phrase|music)$")
    category: str | None = Field(default=None, max_length=100)
    tags: list[str] | None = None
    difficulty: int = Field(default=1, ge=1, le=10)
    default_volume: float = Field(default=1.0, ge=0.0, le=2.0)
    source: str = Field(default="upload", pattern="^(upload|youtube|recorded)$")
    youtube_url: str | None = None


class ClipCreate(ClipBase):
    pass


class ClipUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    type: str | None = Field(default=None, pattern="^(sound|word|phrase|music)$")
    category: str | None = None
    tags: list[str] | None = None
    difficulty: int | None = Field(default=None, ge=1, le=10)
    default_volume: float | None = Field(default=None, ge=0.0, le=2.0)


class ClipResponse(ClipBase):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    file_path: str
    duration: float | None
    created_at: datetime
