import uuid
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.station.commands import PlayCommand, RecordCommand, SessionStartCommand
from app.modules.station.websocket import connection_manager
from app.modules.training.models import Session, SessionLog
from app.modules.training.schemas import SessionCreate, SessionLogCreate, SessionUpdate


async def list_sessions(db: AsyncSession, skip: int = 0, limit: int = 50) -> list[Session]:
    stmt = select(Session).order_by(Session.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_session(db: AsyncSession, session_id: uuid.UUID) -> Session:
    result = await db.execute(
        select(Session).where(Session.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id} not found",
        )
    return session


async def create_session(db: AsyncSession, data: SessionCreate) -> Session:
    session = Session(
        name=data.name,
        objective=data.objective,
        config=data.config,
        is_active=data.is_active,
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def update_session(
    db: AsyncSession, session_id: uuid.UUID, data: SessionUpdate
) -> Session:
    session = await get_session(db, session_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(session, field, value)
    await db.flush()
    await db.refresh(session)
    return session


async def delete_session(db: AsyncSession, session_id: uuid.UUID) -> None:
    session = await get_session(db, session_id)
    await db.delete(session)
    await db.flush()


async def start_session(db: AsyncSession, session_id: uuid.UUID) -> dict[str, str]:
    """Build step list from session config and send SessionStartCommand via WebSocket."""
    session = await get_session(db, session_id)

    if not connection_manager.is_connected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Station is not connected",
        )

    # Build steps from config
    # Expected config structure:
    # { "steps": [{ "clip_id": "...", "volume": 1.0, "record_after": true, "record_duration_ms": 5000 }] }
    raw_steps: list[dict[str, Any]] = session.config.get("steps", [])

    steps: list[dict[str, Any]] = []
    for i, step in enumerate(raw_steps):
        steps.append(
            {
                "step_number": i,
                "clip_id": step.get("clip_id"),
                "volume": step.get("volume", 1.0),
                "record_after": step.get("record_after", False),
                "record_duration_ms": step.get("record_duration_ms", 5000),
            }
        )

    command = SessionStartCommand(
        session_id=str(session.id),
        session_name=session.name,
        steps=steps,
    )
    await connection_manager.send_command(command)
    return {"status": "started", "session_id": str(session.id)}


async def get_session_logs(
    db: AsyncSession, session_id: uuid.UUID, skip: int = 0, limit: int = 100
) -> list[SessionLog]:
    await get_session(db, session_id)
    stmt = (
        select(SessionLog)
        .where(SessionLog.session_id == session_id)
        .order_by(SessionLog.executed_at.asc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def add_log_entry(
    db: AsyncSession, session_id: uuid.UUID, data: SessionLogCreate
) -> SessionLog:
    await get_session(db, session_id)
    log = SessionLog(
        session_id=session_id,
        step_number=data.step_number,
        clip_played_id=data.clip_played_id,
        response_detected=data.response_detected,
        recording_id=data.recording_id,
        result=data.result,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)
    return log
