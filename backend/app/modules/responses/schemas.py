import uuid
from typing import Any

from pydantic import BaseModel, Field


class ResponseRuleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    trigger_type: str = Field(
        ..., pattern="^(sound_detected|keyword|volume_threshold|time_of_day)$"
    )
    trigger_config: dict[str, Any] = Field(default_factory=dict)
    action_type: str = Field(
        ..., pattern="^(play_clip|start_session|record|log)$"
    )
    action_config: dict[str, Any] = Field(default_factory=dict)
    cooldown_secs: float = Field(default=60.0, ge=0.0)
    is_active: bool = True


class ResponseRuleCreate(ResponseRuleBase):
    pass


class ResponseRuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    trigger_type: str | None = Field(
        default=None, pattern="^(sound_detected|keyword|volume_threshold|time_of_day)$"
    )
    trigger_config: dict[str, Any] | None = None
    action_type: str | None = Field(
        default=None, pattern="^(play_clip|start_session|record|log)$"
    )
    action_config: dict[str, Any] | None = None
    cooldown_secs: float | None = Field(default=None, ge=0.0)
    is_active: bool | None = None


class ResponseRuleResponse(ResponseRuleBase):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    times_triggered: int
