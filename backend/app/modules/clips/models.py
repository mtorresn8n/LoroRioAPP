import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Clip(Base):
    __tablename__ = "clips"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="sound"
    )  # sound, word, phrase, music
    category: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    tags: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    default_volume: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    source: Mapped[str] = mapped_column(
        String(50), nullable=False, default="upload"
    )  # upload, youtube, recorded
    youtube_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    recordings: Mapped[list["Recording"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Recording", back_populates="trigger_clip", foreign_keys="Recording.trigger_clip_id"
    )
    session_logs: Mapped[list["SessionLog"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "SessionLog", back_populates="clip_played", foreign_keys="SessionLog.clip_played_id"
    )
    schedule_actions: Mapped[list["ScheduleAction"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "ScheduleAction", back_populates="clip"
    )
