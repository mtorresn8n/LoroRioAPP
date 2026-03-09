import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.modules.scheduler import service
from app.modules.scheduler.schemas import (
    ScheduleCreate,
    ScheduleResponse,
    ScheduleUpdate,
    UpcomingEvent,
)

router = APIRouter(prefix="/scheduler", tags=["scheduler"])


@router.get("/upcoming", response_model=list[UpcomingEvent])
async def get_upcoming(db: AsyncSession = Depends(get_session)) -> list[UpcomingEvent]:
    return await service.get_upcoming_events(db)


@router.get("/", response_model=list[ScheduleResponse])
async def list_schedules(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
) -> list[ScheduleResponse]:
    schedules = await service.list_schedules(db, skip=skip, limit=limit)
    return [ScheduleResponse.model_validate(s) for s in schedules]


@router.post("/", response_model=ScheduleResponse, status_code=status.HTTP_201_CREATED)
async def create_schedule(
    data: ScheduleCreate,
    db: AsyncSession = Depends(get_session),
) -> ScheduleResponse:
    schedule = await service.create_schedule(db, data)
    return ScheduleResponse.model_validate(schedule)


@router.get("/{schedule_id}", response_model=ScheduleResponse)
async def get_schedule(
    schedule_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> ScheduleResponse:
    schedule = await service.get_schedule(db, schedule_id)
    return ScheduleResponse.model_validate(schedule)


@router.put("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: uuid.UUID,
    data: ScheduleUpdate,
    db: AsyncSession = Depends(get_session),
) -> ScheduleResponse:
    schedule = await service.update_schedule(db, schedule_id, data)
    return ScheduleResponse.model_validate(schedule)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(
    schedule_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> None:
    await service.delete_schedule(db, schedule_id)


@router.post("/{schedule_id}/toggle", response_model=ScheduleResponse)
async def toggle_schedule(
    schedule_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> ScheduleResponse:
    schedule = await service.toggle_schedule(db, schedule_id)
    return ScheduleResponse.model_validate(schedule)
