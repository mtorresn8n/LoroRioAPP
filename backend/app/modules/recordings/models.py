import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Recording(Base):
    __tablename__ = "recordings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    file_path: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    peak_volume: Mapped[float | None] = mapped_column(Float, nullable=True)
    classification: Mapped[str | None] = mapped_column(
        String(100), nullable=True, index=True
    )  # speech, noise, silence, parrot
    trigger_clip_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clips.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    starred: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Relationships
    trigger_clip: Mapped["Clip | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Clip", back_populates="recordings", foreign_keys=[trigger_clip_id]
    )
    session_log: Mapped["SessionLog | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "SessionLog", back_populates="recording", foreign_keys="SessionLog.recording_id"
    )
