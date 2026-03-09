import uuid

from sqlalchemy import Boolean, Float, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ResponseRule(Base):
    __tablename__ = "response_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    trigger_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # sound_detected, keyword, volume_threshold, time_of_day
    trigger_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    action_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # play_clip, start_session, record, log
    action_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    cooldown_secs: Mapped[float] = mapped_column(Float, nullable=False, default=60.0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    times_triggered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
