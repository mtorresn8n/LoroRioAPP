import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FoodItem(Base):
    __tablename__ = "food_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    is_safe: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_toxic: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    nutritional_info: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    frequency_recommendation: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    age_restriction: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Relationships
    feeding_logs: Mapped[list["FeedingLog"]] = relationship(
        "FeedingLog", back_populates="food_item"
    )


class FeedingLog(Base):
    __tablename__ = "feeding_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    parrot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parrots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    food_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("food_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    food_name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    food_item: Mapped["FoodItem | None"] = relationship(
        "FoodItem", back_populates="feeding_logs"
    )


class FeedingPlan(Base):
    __tablename__ = "feeding_plans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    parrot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("parrots.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    plan_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
