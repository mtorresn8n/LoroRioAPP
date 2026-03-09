import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Session(Base):
    __tablename__ = "training_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    objective: Mapped[str | None] = mapped_column(String(512), nullable=True)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    logs: Mapped[list["SessionLog"]] = relationship(
        "SessionLog", back_populates="session", cascade="all, delete-orphan"
    )
    schedule_actions: Mapped[list["ScheduleAction"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "ScheduleAction", back_populates="session"
    )


class SessionLog(Base):
    __tablename__ = "session_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    executed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    step_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    clip_played_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clips.id", ondelete="SET NULL"),
        nullable=True,
    )
    response_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    recording_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("recordings.id", ondelete="SET NULL"),
        nullable=True,
    )
    result: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )  # success, failure, timeout, skipped

    # Relationships
    session: Mapped["Session"] = relationship("Session", back_populates="logs")
    clip_played: Mapped["Clip | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Clip", back_populates="session_logs", foreign_keys=[clip_played_id]
    )
    recording: Mapped["Recording | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Recording", back_populates="session_log", foreign_keys=[recording_id]
    )
