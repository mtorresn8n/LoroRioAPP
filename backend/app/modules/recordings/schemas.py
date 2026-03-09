import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class RecordingBase(BaseModel):
    classification: str | None = Field(
        default=None, pattern="^(speech|noise|silence|parrot)$"
    )
    notes: str | None = None
    starred: bool = False


class RecordingCreate(RecordingBase):
    trigger_clip_id: uuid.UUID | None = None


class RecordingUpdate(BaseModel):
    classification: str | None = Field(
        default=None, pattern="^(speech|noise|silence|parrot)$"
    )
    notes: str | None = None
    starred: bool | None = None
    trigger_clip_id: uuid.UUID | None = None


class RecordingResponse(RecordingBase):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    file_path: str
    recorded_at: datetime
    duration: float | None
    peak_volume: float | None
    trigger_clip_id: uuid.UUID | None


class RecordingStats(BaseModel):
    total: int
    by_classification: dict[str, int]
    starred_count: int
    avg_duration: float | None
    total_duration: float | None
