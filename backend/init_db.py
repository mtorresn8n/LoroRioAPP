"""Script to initialize the database tables.

Usage:
    python init_db.py

Creates all tables defined in the SQLAlchemy models.
For production, use Alembic migrations instead.
"""

import asyncio
import sys

from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.database import Base

# Import all models so they register with Base.metadata
from app.modules.clips.models import Clip  # noqa: F401
from app.modules.recordings.models import Recording  # noqa: F401
from app.modules.training.models import SessionLog, TrainingSession  # noqa: F401
from app.modules.scheduler.models import Schedule, ScheduleAction  # noqa: F401
from app.modules.responses.models import ResponseRule  # noqa: F401
from app.modules.ai.models import AiAnalysis, AiTrainingPlan, ClonedVoice  # noqa: F401
from app.modules.settings.models import UserSettings  # noqa: F401
from app.modules.parrot.models import Parrot  # noqa: F401
from app.modules.feeding.models import FeedingLog, FeedingPlan, FoodItem  # noqa: F401


async def init() -> None:
    print(f"Connecting to: {settings.DATABASE_URL}")
    engine = create_async_engine(settings.DATABASE_URL)

    async with engine.begin() as conn:
        print("Creating all tables...")
        await conn.run_sync(Base.metadata.create_all)

    await engine.dispose()
    print("Done! All tables created.")


if __name__ == "__main__":
    try:
        asyncio.run(init())
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
