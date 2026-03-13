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

# Message types that get forwarded between station and control
_SIGNALING_TYPES = {"webrtc_offer", "webrtc_answer", "webrtc_ice_candidate"}

# Station events forwarded to control AND emitted to event_bus
_DUAL_ROUTE_TYPES = {"sound_detected", "recording_ready", "playback_finished"}

# Station events forwarded to control only
_CONTROL_ONLY_TYPES = {"station_status", "session_progress", "session_finished", "clip_started", "clip_finished"}

# Event bus mapping for dual-routed types
_EVENT_MAP = {
    "sound_detected": EventType.SOUND_DETECTED,
    "recording_ready": EventType.RECORDING_READY,
    "playback_finished": EventType.CLIP_PLAYED,
}


class ConnectionManager:
    def __init__(self) -> None:
        self._station: WebSocket | None = None
        self._control: WebSocket | None = None
        self._station_last_heartbeat: datetime | None = None
        self._station_battery: float | None = None
        self._station_firmware: str | None = None

    @property
    def station_connected(self) -> bool:
        return self._station is not None

    @property
    def control_connected(self) -> bool:
        return self._control is not None

    # ── Connect / Disconnect ─────────────────────────────────────────

    async def connect_station(self, websocket: WebSocket) -> None:
        # Replace existing station if any
        if self._station is not None:
            try:
                await self._station.close(code=4002, reason="Replaced by new connection")
            except Exception:
                pass
            self._station = None

        await websocket.accept()
        self._station = websocket
        self._station_last_heartbeat = datetime.now(timezone.utc)
        logger.info("Station (Host) connected")

        # Notify control
        await self._send_to_control({"type": "station_connected"})

    async def connect_control(self, websocket: WebSocket) -> None:
        # Replace existing control if any
        if self._control is not None:
            try:
                await self._control.close(code=4002, reason="Replaced by new connection")
            except Exception:
                pass
            self._control = None

        await websocket.accept()
        self._control = websocket
        logger.info("Control (Server) connected")

        # Notify station
        await self._send_to_station({"type": "control_connected"})

        # Send current station status to new control
        if self._station is not None:
            await self._send_to_control({"type": "station_connected"})

    def disconnect_station(self) -> None:
        self._station = None
        self._station_last_heartbeat = None
        logger.info("Station (Host) disconnected")

    def disconnect_control(self) -> None:
        self._control = None
        logger.info("Control (Server) disconnected")

    async def notify_station_disconnected(self) -> None:
        """Called after disconnect_station to notify control."""
        await self._send_to_control({"type": "station_disconnected"})

    async def notify_control_disconnected(self) -> None:
        """Called after disconnect_control to notify station."""
        await self._send_to_station({"type": "control_disconnected"})
        await self._send_to_station({"type": "webrtc_reset"})

    # ── Send helpers ─────────────────────────────────────────────────

    async def send_command(self, command: BaseCommand) -> None:
        """Send a structured command to the station (used by scheduler/responses)."""
        if self._station is None:
            raise RuntimeError("No station connected")
        payload = json.dumps(command.to_ws_message())
        await self._station.send_text(payload)
        logger.debug("Sent command: %s", command.type)  # type: ignore[attr-defined]

    async def send_to_station(self, message: dict[str, Any]) -> None:
        """Public helper to send a raw message to the station."""
        await self._send_to_station(message)

    async def send_to_control(self, message: dict[str, Any]) -> None:
        """Public helper to send a raw message to the control."""
        await self._send_to_control(message)

    async def _send_to_station(self, message: dict[str, Any]) -> None:
        if self._station is None:
            return
        try:
            await self._station.send_text(json.dumps(message))
        except Exception:
            pass

    async def _send_to_control(self, message: dict[str, Any]) -> None:
        if self._control is None:
            return
        try:
            await self._control.send_text(json.dumps(message))
        except Exception:
            pass

    # ── Message routing ──────────────────────────────────────────────

    async def handle_station_message(self, raw: str) -> None:
        """Route incoming message from station (Host)."""
        try:
            data: dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Invalid JSON from station: %s", raw[:200])
            return

        msg_type: str = data.get("type", "")
        logger.debug("Station message: %s", msg_type)

        # Signaling — forward to control
        if msg_type in _SIGNALING_TYPES:
            await self._send_to_control(data)
            return

        # Heartbeat — handle locally + forward battery to control
        if msg_type in ("ping", "heartbeat"):
            self._station_last_heartbeat = datetime.now(timezone.utc)
            self._station_battery = data.get("battery")
            self._station_firmware = data.get("firmware_version")
            await self._send_to_station({"type": "pong"})
            await self._send_to_control({
                "type": "station_heartbeat",
                "battery": self._station_battery,
                "firmware_version": self._station_firmware,
                "last_heartbeat": self._station_last_heartbeat.isoformat(),
            })
            return

        # Dual-routed — forward to control AND emit to event_bus
        if msg_type in _DUAL_ROUTE_TYPES:
            await self._send_to_control(data)
            event_type = _EVENT_MAP.get(msg_type)
            if event_type:
                await event_bus.emit(event_type, data)
            return

        # Control-only — forward to control
        if msg_type in _CONTROL_ONLY_TYPES:
            await self._send_to_control(data)
            return

        # play_random — handled by backend
        if msg_type == "play_random":
            await self._handle_play_random()
            return

        # pause/resume — log and forward
        if msg_type in ("pause", "resume"):
            logger.info("Station %s", msg_type)
            await self._send_to_control(data)
            return

        logger.warning("Unknown station message type: %s", msg_type)

    async def handle_control_message(self, raw: str) -> None:
        """Route incoming message from control (Server)."""
        try:
            data: dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Invalid JSON from control: %s", raw[:200])
            return

        msg_type: str = data.get("type", "")
        logger.debug("Control message: %s", msg_type)

        # Signaling — forward to station
        if msg_type in _SIGNALING_TYPES:
            await self._send_to_station(data)
            return

        # Heartbeat from control
        if msg_type in ("ping", "heartbeat"):
            await self._send_to_control({"type": "pong"})
            return

        # play_random — handled by backend, not forwarded
        if msg_type == "play_random":
            await self._handle_play_random()
            return

        # All other commands — forward to station
        await self._send_to_station(data)

    async def _handle_play_random(self) -> None:
        try:
            async with async_session_factory() as db:
                result = await db.execute(select(Clip))
                clips = result.scalars().all()
            if not clips:
                logger.warning("No clips for play_random")
                return
            clip = random.choice(clips)
            msg = {
                "type": "play_clip",
                "clip_id": str(clip.id),
                "clip_name": clip.name,
            }
            await self._send_to_station(msg)
            await self._send_to_control(msg)
        except Exception as exc:
            logger.error("play_random error: %s", exc, exc_info=True)


# Module-level singleton
connection_manager = ConnectionManager()


async def station_websocket_handler(websocket: WebSocket) -> None:
    """Entry point for /ws/station (Host device)."""
    from app.modules.auth.service import validate_ws_cookie

    if not await validate_ws_cookie(websocket):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await connection_manager.connect_station(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            await connection_manager.handle_station_message(raw)
    except WebSocketDisconnect:
        connection_manager.disconnect_station()
        await connection_manager.notify_station_disconnected()
    except Exception as exc:
        logger.error("Station WS error: %s", exc, exc_info=True)
        connection_manager.disconnect_station()
        await connection_manager.notify_station_disconnected()


async def control_websocket_handler(websocket: WebSocket) -> None:
    """Entry point for /ws/control (Server/owner device)."""
    from app.modules.auth.service import validate_ws_cookie

    if not await validate_ws_cookie(websocket):
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await connection_manager.connect_control(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            await connection_manager.handle_control_message(raw)
    except WebSocketDisconnect:
        connection_manager.disconnect_control()
        await connection_manager.notify_control_disconnected()
    except Exception as exc:
        logger.error("Control WS error: %s", exc, exc_info=True)
        connection_manager.disconnect_control()
        await connection_manager.notify_control_disconnected()
