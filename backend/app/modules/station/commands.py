import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field


class BaseCommand(BaseModel):
    """Base for all commands sent to the station via WebSocket."""

    command_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    def to_ws_message(self) -> dict[str, Any]:
        return self.model_dump()


class PlayCommand(BaseCommand):
    type: Literal["play"] = "play"
    clip_path: str
    volume: float = Field(default=1.0, ge=0.0, le=2.0)
    repetitions: int = Field(default=1, ge=1)
    pause_between_ms: int = Field(default=0, ge=0)


class RecordCommand(BaseCommand):
    type: Literal["record"] = "record"
    duration_ms: int = Field(default=5000, ge=500)
    trigger_clip_id: str | None = None
    session_id: str | None = None
    step_number: int | None = None


class StartDetectionCommand(BaseCommand):
    type: Literal["start_detection"] = "start_detection"
    sensitivity: float = Field(default=0.5, ge=0.0, le=1.0)
    min_duration_ms: int = Field(default=200, ge=50)


class StopDetectionCommand(BaseCommand):
    type: Literal["stop_detection"] = "stop_detection"


class SessionStartCommand(BaseCommand):
    type: Literal["session_start"] = "session_start"
    session_id: str
    session_name: str
    steps: list[dict[str, Any]] = Field(default_factory=list)
