import asyncio
import logging
from collections import defaultdict
from collections.abc import Callable, Coroutine
from enum import StrEnum
from typing import Any

logger = logging.getLogger(__name__)


class EventType(StrEnum):
    SOUND_DETECTED = "sound_detected"
    RECORDING_READY = "recording_ready"
    CLIP_PLAYED = "clip_played"
    SESSION_STEP = "session_step"
    SCHEDULE_TRIGGERED = "schedule_triggered"


# Handler signature: async def handler(data: dict) -> None
Handler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, list[Handler]] = defaultdict(list)

    def subscribe(self, event_type: EventType | str, handler: Handler) -> None:
        """Register an async handler for the given event type."""
        self._subscribers[str(event_type)].append(handler)

    def unsubscribe(self, event_type: EventType | str, handler: Handler) -> None:
        """Remove a previously registered handler."""
        key = str(event_type)
        handlers = self._subscribers.get(key, [])
        if handler in handlers:
            handlers.remove(handler)

    async def emit(self, event_type: EventType | str, data: dict[str, Any]) -> None:
        """Dispatch event to all registered handlers concurrently."""
        key = str(event_type)
        handlers = self._subscribers.get(key, [])
        if not handlers:
            return
        results = await asyncio.gather(
            *[handler(data) for handler in handlers],
            return_exceptions=True,
        )
        for result in results:
            if isinstance(result, Exception):
                logger.error(
                    "Event handler error for %s: %s", key, result, exc_info=result
                )


# Module-level singleton
event_bus = EventBus()
