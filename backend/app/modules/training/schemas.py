import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class SessionBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    objective: str | None = Field(default=None, max_length=512)
    config: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class SessionCreate(SessionBase):
    pass


class SessionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    objective: str | None = None
    config: dict[str, Any] | None = None
    is_active: bool | None = None


class SessionResponse(SessionBase):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    created_at: datetime


class SessionLogCreate(BaseModel):
    step_number: int = Field(..., ge=0)
    clip_played_id: uuid.UUID | None = None
    response_detected: bool = False
    recording_id: uuid.UUID | None = None
    result: str | None = Field(
        default=None, pattern="^(success|failure|timeout|skipped)$"
    )


class SessionLogResponse(SessionLogCreate):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    session_id: uuid.UUID
    executed_at: datetime
