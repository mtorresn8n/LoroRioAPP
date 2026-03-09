import uuid

from pydantic import BaseModel, Field


class ScheduleActionBase(BaseModel):
    action_type: str = Field(
        ..., pattern="^(play_clip|start_session|record|detect)$"
    )
    clip_id: uuid.UUID | None = None
    session_id: uuid.UUID | None = None
    volume: float = Field(default=1.0, ge=0.0, le=2.0)
    repetitions: int = Field(default=1, ge=1, le=100)
    pause_between: float = Field(default=0.0, ge=0.0)
    order_index: int = Field(default=0, ge=0)


class ScheduleActionCreate(ScheduleActionBase):
    pass


class ScheduleActionUpdate(BaseModel):
    action_type: str | None = Field(
        default=None, pattern="^(play_clip|start_session|record|detect)$"
    )
    clip_id: uuid.UUID | None = None
    session_id: uuid.UUID | None = None
    volume: float | None = Field(default=None, ge=0.0, le=2.0)
    repetitions: int | None = Field(default=None, ge=1, le=100)
    pause_between: float | None = Field(default=None, ge=0.0)
    order_index: int | None = Field(default=None, ge=0)


class ScheduleActionResponse(ScheduleActionBase):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    schedule_id: uuid.UUID


class ScheduleBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    schedule_type: str = Field(
        default="daily", pattern="^(daily|weekly|interval|once)$"
    )
    time_start: str | None = Field(
        default=None, pattern="^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$"
    )
    time_end: str | None = Field(
        default=None, pattern="^([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d$"
    )
    days_of_week: list[int] | None = None
    is_active: bool = True
    priority: int = Field(default=5, ge=1, le=10)


class ScheduleCreate(ScheduleBase):
    actions: list[ScheduleActionCreate] = Field(default_factory=list)


class ScheduleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    schedule_type: str | None = Field(
        default=None, pattern="^(daily|weekly|interval|once)$"
    )
    time_start: str | None = None
    time_end: str | None = None
    days_of_week: list[int] | None = None
    is_active: bool | None = None
    priority: int | None = Field(default=None, ge=1, le=10)
    actions: list[ScheduleActionCreate] | None = None


class ScheduleResponse(ScheduleBase):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    actions: list[ScheduleActionResponse] = Field(default_factory=list)


class UpcomingEvent(BaseModel):
    schedule_id: uuid.UUID
    schedule_name: str
    next_run: str
    action_count: int
