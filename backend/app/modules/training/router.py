import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.modules.training import service
from app.modules.training.schemas import (
    SessionCreate,
    SessionLogCreate,
    SessionLogResponse,
    SessionResponse,
    SessionUpdate,
)

router = APIRouter(prefix="/training", tags=["training"])


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_session),
) -> list[SessionResponse]:
    sessions = await service.list_sessions(db, skip=skip, limit=limit)
    return [SessionResponse.model_validate(s) for s in sessions]


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_session),
) -> SessionResponse:
    session = await service.create_session(db, data)
    return SessionResponse.model_validate(session)


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> SessionResponse:
    session = await service.get_session(db, session_id)
    return SessionResponse.model_validate(session)


@router.put("/sessions/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: uuid.UUID,
    data: SessionUpdate,
    db: AsyncSession = Depends(get_session),
) -> SessionResponse:
    session = await service.update_session(db, session_id, data)
    return SessionResponse.model_validate(session)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> None:
    await service.delete_session(db, session_id)


@router.post("/sessions/{session_id}/start")
async def start_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    return await service.start_session(db, session_id)


@router.get("/sessions/{session_id}/logs", response_model=list[SessionLogResponse])
async def get_session_logs(
    session_id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_session),
) -> list[SessionLogResponse]:
    logs = await service.get_session_logs(db, session_id, skip=skip, limit=limit)
    return [SessionLogResponse.model_validate(log) for log in logs]


@router.post(
    "/sessions/{session_id}/log",
    response_model=SessionLogResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_log_entry(
    session_id: uuid.UUID,
    data: SessionLogCreate,
    db: AsyncSession = Depends(get_session),
) -> SessionLogResponse:
    log = await service.add_log_entry(db, session_id, data)
    return SessionLogResponse.model_validate(log)
