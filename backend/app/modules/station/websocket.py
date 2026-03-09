import json
import logging
import random
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.database import async_session_factory
from app.modules.clips.models import Clip
from app.modules.station.commands import BaseCommand
from app.shared.events import EventType, event_bus

logger = logging.getLogger(__name__)


class StationStatus:
    def __init__(self) -> None:
        self.connected: bool = False
        self.last_heartbeat: datetime | None = None
        self.battery: float | None = None
        self.firmware_version: str | None = None


class ConnectionManager:
    def __init__(self) -> None:
        self._connection: WebSocket | None = None
        self.status: StationStatus = StationStatus()

    @property
    def is_connected(self) -> bool:
        return self._connection is not None and self.status.connected

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connection = websocket
        self.status.connected = True
        self.status.last_heartbeat = datetime.now(timezone.utc)
        logger.info("Station connected")

    def disconnect(self) -> None:
        self._connection = None
        self.status.connected = False
        logger.info("Station disconnected")

    async def send_command(self, command: BaseCommand) -> None:
        """Send a structured command to the connected station."""
        if self._connection is None:
            raise RuntimeError("No station connected")
        payload = json.dumps(command.to_ws_message())
        await self._connection.send_text(payload)
        logger.debug("Sent command: %s", command.type)  # type: ignore[attr-defined]

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Send a raw message to the connected station (if any)."""
        if self._connection is None:
            return
        await self._connection.send_text(json.dumps(message))

    async def handle_incoming(self, raw: str) -> None:
        """Parse and route incoming messages from the station."""
        try:
            data: dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Received invalid JSON from station: %s", raw[:200])
            return

        event_type_raw: str = data.get("type", "")
        logger.debug("Received station event: %s", event_type_raw)

        match event_type_raw:
            case "ping" | "heartbeat":
                self.status.last_heartbeat = datetime.now(timezone.utc)
                self.status.battery = data.get("battery")
                self.status.firmware_version = data.get("firmware_version")

            case "sound_detected":
                await event_bus.emit(EventType.SOUND_DETECTED, data)

            case "recording_ready":
                await event_bus.emit(EventType.RECORDING_READY, data)

            case "playback_finished":
                await event_bus.emit(EventType.CLIP_PLAYED, data)

            case "play_random":
                await self._handle_play_random()

            case "pause" | "resume":
                logger.info("Station %s", event_type_raw)

            case _:
                logger.warning("Unknown event type from station: %s", event_type_raw)

    async def _handle_play_random(self) -> None:
        """Pick a random clip from the library and send play_clip command."""
        try:
            async with async_session_factory() as db:
                result = await db.execute(select(Clip))
                clips = result.scalars().all()
            if not clips:
                logger.warning("No clips available for play_random")
                return
            clip = random.choice(clips)
            await self.broadcast({
                "type": "play_clip",
                "clip_id": str(clip.id),
                "clip_name": clip.name,
            })
        except Exception as exc:
            logger.error("Error handling play_random: %s", exc, exc_info=True)


# Module-level singleton used by routes and scheduler
connection_manager = ConnectionManager()


async def station_websocket_handler(websocket: WebSocket) -> None:
    """Entry point for the /ws/station WebSocket endpoint."""
    await connection_manager.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            await connection_manager.handle_incoming(raw)
    except WebSocketDisconnect:
        connection_manager.disconnect()
    except Exception as exc:
        logger.error("Unexpected WebSocket error: %s", exc, exc_info=True)
        connection_manager.disconnect()
