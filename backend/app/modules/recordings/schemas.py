import math
import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class RecordingBase(BaseModel):
    classification: str | None = None
    notes: str | None = None
    starred: bool = False


class RecordingCreate(RecordingBase):
    trigger_clip_id: uuid.UUID | None = None


class RecordingUpdate(BaseModel):
    classification: str | None = None
    notes: str | None = None
    starred: bool | None = None
    trigger_clip_id: uuid.UUID | None = None


class RecordingResponse(BaseModel):
    """Response schema without restrictive pattern validators."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    classification: str | None = None
    notes: str | None = None
    starred: bool = False
    file_path: str
    recorded_at: datetime
    duration: float | None = None
    peak_volume: float | None = None
    trigger_clip_id: uuid.UUID | None = None

    @field_validator("peak_volume", "duration", mode="before")
    @classmethod
    def sanitize_non_finite(cls, v: object) -> float | None:
        """Replace -inf, inf, and NaN float values with None.

        pydub's max_dBFS returns -inf for silent audio, which is not
        JSON-serializable and raises ValueError during response encoding.
        """
        if v is None:
            return None
        try:
            f = float(v)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None
        return f if math.isfinite(f) else None


class RecordingStats(BaseModel):
    total: int
    by_classification: dict[str, int]
    starred_count: int
    avg_duration: float | None
    total_duration: float | None


class DailyStats(BaseModel):
    date: str
    clips_played: int = 0
    recordings_made: int = 0
    sessions_completed: int = 0
    sounds_detected: int = 0
    uptime_minutes: int = 0
