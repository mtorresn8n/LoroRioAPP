import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.scheduler.models import Schedule, ScheduleAction
from app.modules.scheduler.schemas import (
    ScheduleCreate,
    ScheduleUpdate,
    UpcomingEvent,
)
from app.modules.station.commands import PlayCommand, RecordCommand, SessionStartCommand
from app.modules.station.websocket import connection_manager
from app.shared.events import EventType, event_bus

logger = logging.getLogger(__name__)

# Module-level APScheduler instance
scheduler = AsyncIOScheduler(timezone="UTC")


# ----- APScheduler job execution -----

async def _execute_schedule_actions(schedule_id: str) -> None:
    """Called by APScheduler to run all actions of a schedule."""
    from app.database import async_session_factory

    async with async_session_factory() as db:
        result = await db.execute(
            select(Schedule)
            .options(selectinload(Schedule.actions))
            .where(Schedule.id == uuid.UUID(schedule_id))
        )
        schedule = result.scalar_one_or_none()
        if schedule is None or not schedule.is_active:
            return

        await event_bus.emit(EventType.SCHEDULE_TRIGGERED, {"schedule_id": schedule_id})

        for action in sorted(schedule.actions, key=lambda a: a.order_index):
            await _dispatch_action(action)


async def _dispatch_action(action: ScheduleAction) -> None:
    """Send the appropriate WebSocket command for a schedule action."""
    if not connection_manager.is_connected:
        logger.warning("Schedule action skipped: station not connected")
        return

    match action.action_type:
        case "play_clip":
            if action.clip_id is None:
                return
            from app.database import async_session_factory

            async with async_session_factory() as db:
                from app.modules.clips.models import Clip
                result = await db.execute(
                    select(Clip).where(Clip.id == action.clip_id)
                )
                clip = result.scalar_one_or_none()
                if clip is None:
                    return
            cmd = PlayCommand(
                clip_path=clip.file_path,
                volume=action.volume,
                repetitions=action.repetitions,
                pause_between_ms=int(action.pause_between * 1000),
            )
            await connection_manager.send_command(cmd)

        case "record":
            cmd = RecordCommand(duration_ms=5000)
            await connection_manager.send_command(cmd)

        case "start_session":
            if action.session_id is None:
                return
            from app.database import async_session_factory
            from app.modules.training import service as training_service

            async with async_session_factory() as db:
                await training_service.start_session(db, action.session_id)

        case _:
            logger.warning("Unknown action type: %s", action.action_type)


# ----- APScheduler job registration -----

def _build_trigger(schedule: Schedule) -> CronTrigger | IntervalTrigger | None:
    if schedule.time_start is None:
        return None

    time_parts = schedule.time_start.split(":")
    hour, minute = int(time_parts[0]), int(time_parts[1])

    match schedule.schedule_type:
        case "daily":
            return CronTrigger(hour=hour, minute=minute, timezone="UTC")

        case "weekly":
            days = schedule.days_of_week or []
            day_abbr = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
            day_of_week = ",".join(day_abbr[d] for d in days if 0 <= d <= 6)
            return CronTrigger(
                day_of_week=day_of_week or "*",
                hour=hour,
                minute=minute,
                timezone="UTC",
            )

        case "interval":
            # time_start treated as HH:MM:SS interval duration
            total_seconds = hour * 3600 + minute * 60
            if total_seconds == 0:
                total_seconds = 3600
            return IntervalTrigger(seconds=total_seconds)

        case _:
            return None


def register_schedule(schedule: Schedule) -> None:
    """Add or replace APScheduler job for a schedule."""
    job_id = f"schedule_{schedule.id}"
    trigger = _build_trigger(schedule)
    if trigger is None:
        logger.warning("Could not build trigger for schedule %s", schedule.id)
        return
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
    scheduler.add_job(
        _execute_schedule_actions,
        trigger=trigger,
        id=job_id,
        args=[str(schedule.id)],
        replace_existing=True,
    )
    logger.info("Registered APScheduler job: %s", job_id)


def unregister_schedule(schedule_id: uuid.UUID) -> None:
    """Remove APScheduler job for a schedule."""
    job_id = f"schedule_{schedule_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info("Removed APScheduler job: %s", job_id)


# ----- CRUD -----

async def _load_with_actions(db: AsyncSession, schedule_id: uuid.UUID) -> Schedule:
    result = await db.execute(
        select(Schedule)
        .options(selectinload(Schedule.actions))
        .where(Schedule.id == schedule_id)
    )
    schedule = result.scalar_one_or_none()
    if schedule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule {schedule_id} not found",
        )
    return schedule


async def list_schedules(db: AsyncSession, skip: int = 0, limit: int = 50) -> list[Schedule]:
    stmt = (
        select(Schedule)
        .options(selectinload(Schedule.actions))
        .order_by(Schedule.priority.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_schedule(db: AsyncSession, schedule_id: uuid.UUID) -> Schedule:
    return await _load_with_actions(db, schedule_id)


async def create_schedule(db: AsyncSession, data: ScheduleCreate) -> Schedule:
    schedule = Schedule(
        name=data.name,
        schedule_type=data.schedule_type,
        time_start=data.time_start,
        time_end=data.time_end,
        days_of_week=data.days_of_week,
        is_active=data.is_active,
        priority=data.priority,
    )
    db.add(schedule)
    await db.flush()

    for action_data in data.actions:
        action = ScheduleAction(
            schedule_id=schedule.id,
            **action_data.model_dump(),
        )
        db.add(action)

    await db.flush()
    await db.refresh(schedule)

    result = await db.execute(
        select(Schedule)
        .options(selectinload(Schedule.actions))
        .where(Schedule.id == schedule.id)
    )
    schedule = result.scalar_one()

    if schedule.is_active:
        register_schedule(schedule)

    return schedule


async def update_schedule(
    db: AsyncSession, schedule_id: uuid.UUID, data: ScheduleUpdate
) -> Schedule:
    schedule = await _load_with_actions(db, schedule_id)
    update_data = data.model_dump(exclude_unset=True, exclude={"actions"})
    for field, value in update_data.items():
        setattr(schedule, field, value)

    if data.actions is not None:
        for existing in list(schedule.actions):
            await db.delete(existing)
        await db.flush()
        for action_data in data.actions:
            action = ScheduleAction(
                schedule_id=schedule.id,
                **action_data.model_dump(),
            )
            db.add(action)

    await db.flush()

    result = await db.execute(
        select(Schedule)
        .options(selectinload(Schedule.actions))
        .where(Schedule.id == schedule.id)
    )
    schedule = result.scalar_one()

    if schedule.is_active:
        register_schedule(schedule)
    else:
        unregister_schedule(schedule.id)

    return schedule


async def delete_schedule(db: AsyncSession, schedule_id: uuid.UUID) -> None:
    schedule = await get_schedule(db, schedule_id)
    unregister_schedule(schedule.id)
    await db.delete(schedule)
    await db.flush()


async def toggle_schedule(db: AsyncSession, schedule_id: uuid.UUID) -> Schedule:
    schedule = await _load_with_actions(db, schedule_id)
    schedule.is_active = not schedule.is_active
    await db.flush()
    if schedule.is_active:
        register_schedule(schedule)
    else:
        unregister_schedule(schedule.id)
    await db.refresh(schedule)
    return schedule


async def get_upcoming_events(db: AsyncSession) -> list[UpcomingEvent]:
    """Return next run times for all active schedules."""
    stmt = (
        select(Schedule)
        .options(selectinload(Schedule.actions))
        .where(Schedule.is_active == True)  # noqa: E712
    )
    result = await db.execute(stmt)
    schedules = result.scalars().all()

    events: list[UpcomingEvent] = []
    for schedule in schedules:
        job_id = f"schedule_{schedule.id}"
        job = scheduler.get_job(job_id)
        next_run: str = "not scheduled"
        if job and job.next_run_time:
            next_run = job.next_run_time.isoformat()

        events.append(
            UpcomingEvent(
                schedule_id=schedule.id,
                schedule_name=schedule.name,
                next_run=next_run,
                action_count=len(schedule.actions),
            )
        )

    return events


async def bootstrap_scheduler(db: AsyncSession) -> None:
    """Register all active schedules on startup."""
    stmt = (
        select(Schedule)
        .options(selectinload(Schedule.actions))
        .where(Schedule.is_active == True)  # noqa: E712
    )
    result = await db.execute(stmt)
    for schedule in result.scalars().all():
        register_schedule(schedule)
    logger.info("Scheduler bootstrap complete")
