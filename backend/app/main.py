import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import async_session_factory
from app.modules.clips.router import router as clips_router
from app.modules.feeding.router import router as feeding_router
from app.modules.feeding.service import seed_default_foods
from app.modules.parrot.router import router as parrot_router
from app.modules.recordings.router import router as recordings_router
from app.modules.responses.router import router as responses_router
from app.modules.responses.service import register_event_handlers
from app.modules.scheduler.router import router as scheduler_router
from app.modules.scheduler.service import bootstrap_scheduler, scheduler
from app.modules.station.websocket import station_websocket_handler
from app.modules.training.router import router as training_router
from app.modules.ai.router import router as ai_router
from app.modules.settings.router import router as settings_router
from app.modules.settings.service import ensure_defaults
from app.modules.youtube.router import router as youtube_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting LoroApp backend...")

    # Register event bus handlers for response engine
    register_event_handlers()

    # Ensure default settings exist and seed food catalog
    async with async_session_factory() as db:
        await ensure_defaults(db)
        await seed_default_foods(db)
        await db.commit()

    # Bootstrap APScheduler with all active schedules from DB
    async with async_session_factory() as db:
        await bootstrap_scheduler(db)

    # Start APScheduler
    scheduler.start()
    logger.info("APScheduler started")

    yield

    # Shutdown
    scheduler.shutdown(wait=False)
    logger.info("APScheduler stopped")


app = FastAPI(
    title="LoroApp API",
    version="1.0.0",
    description="Backend for LoroApp - a parrot training system",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for media
app.mount("/media", StaticFiles(directory=settings.MEDIA_PATH), name="media")

# API routers
API_PREFIX = "/api/v1"

app.include_router(clips_router, prefix=API_PREFIX)
app.include_router(youtube_router, prefix=API_PREFIX)
app.include_router(recordings_router, prefix=API_PREFIX)
app.include_router(training_router, prefix=API_PREFIX)
app.include_router(scheduler_router, prefix=API_PREFIX)
app.include_router(responses_router, prefix=API_PREFIX)
app.include_router(ai_router, prefix=API_PREFIX)
app.include_router(settings_router, prefix=API_PREFIX)
app.include_router(parrot_router, prefix=API_PREFIX)
app.include_router(feeding_router, prefix=API_PREFIX)


# WebSocket endpoint
@app.websocket("/ws/station")
async def ws_station(websocket: WebSocket) -> None:
    await station_websocket_handler(websocket)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "loroapp-backend"}
