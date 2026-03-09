import uuid

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Time
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Schedule(Base):
    __tablename__ = "schedules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    schedule_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="daily"
    )  # daily, weekly, interval, once
    time_start: Mapped[str | None] = mapped_column(
        String(8), nullable=True
    )  # HH:MM:SS string
    time_end: Mapped[str | None] = mapped_column(
        String(8), nullable=True
    )  # HH:MM:SS string
    days_of_week: Mapped[list[int] | None] = mapped_column(
        ARRAY(Integer), nullable=True
    )  # 0=Monday, 6=Sunday
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=5)

    # Relationships
    actions: Mapped[list["ScheduleAction"]] = relationship(
        "ScheduleAction",
        back_populates="schedule",
        cascade="all, delete-orphan",
        order_by="ScheduleAction.order_index",
    )


class ScheduleAction(Base):
    __tablename__ = "schedule_actions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    schedule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("schedules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # play_clip, start_session, record, detect
    clip_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clips.id", ondelete="SET NULL"),
        nullable=True,
    )
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("training_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    volume: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    repetitions: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    pause_between: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relationships
    schedule: Mapped["Schedule"] = relationship("Schedule", back_populates="actions")
    clip: Mapped["Clip | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Clip", back_populates="schedule_actions"
    )
    session: Mapped["Session | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Session", back_populates="schedule_actions"
    )
