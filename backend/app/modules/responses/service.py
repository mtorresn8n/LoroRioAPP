import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.responses.models import ResponseRule
from app.modules.responses.schemas import (
    ResponseRuleCreate,
    ResponseRuleUpdate,
)
from app.shared.events import EventType, event_bus

logger = logging.getLogger(__name__)

# Track last trigger times to enforce cooldowns: rule_id -> datetime
_last_triggered: dict[str, datetime] = {}


async def list_rules(db: AsyncSession, skip: int = 0, limit: int = 50) -> list[ResponseRule]:
    stmt = select(ResponseRule).order_by(ResponseRule.name).offset(skip).limit(limit)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_rule(db: AsyncSession, rule_id: uuid.UUID) -> ResponseRule:
    result = await db.execute(select(ResponseRule).where(ResponseRule.id == rule_id))
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"ResponseRule {rule_id} not found",
        )
    return rule


async def create_rule(db: AsyncSession, data: ResponseRuleCreate) -> ResponseRule:
    rule = ResponseRule(
        name=data.name,
        trigger_type=data.trigger_type,
        trigger_config=data.trigger_config,
        action_type=data.action_type,
        action_config=data.action_config,
        cooldown_secs=data.cooldown_secs,
        is_active=data.is_active,
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


async def update_rule(
    db: AsyncSession, rule_id: uuid.UUID, data: ResponseRuleUpdate
) -> ResponseRule:
    rule = await get_rule(db, rule_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)
    await db.flush()
    await db.refresh(rule)
    return rule


async def delete_rule(db: AsyncSession, rule_id: uuid.UUID) -> None:
    rule = await get_rule(db, rule_id)
    await db.delete(rule)
    await db.flush()


async def toggle_rule(db: AsyncSession, rule_id: uuid.UUID) -> ResponseRule:
    rule = await get_rule(db, rule_id)
    rule.is_active = not rule.is_active
    await db.flush()
    await db.refresh(rule)
    return rule


def _is_in_cooldown(rule: ResponseRule) -> bool:
    last = _last_triggered.get(str(rule.id))
    if last is None:
        return False
    elapsed = (datetime.now(timezone.utc) - last).total_seconds()
    return elapsed < rule.cooldown_secs


def _matches_trigger(rule: ResponseRule, event_data: dict[str, Any]) -> bool:
    """Check if the incoming event data satisfies the rule's trigger conditions."""
    match rule.trigger_type:
        case "sound_detected":
            # Trigger config may specify a min_confidence threshold
            min_confidence: float = rule.trigger_config.get("min_confidence", 0.0)
            confidence: float = event_data.get("confidence", 1.0)
            return confidence >= min_confidence

        case "volume_threshold":
            threshold: float = rule.trigger_config.get("threshold_dBFS", -30.0)
            peak_volume: float = event_data.get("peak_volume", -100.0)
            return peak_volume >= threshold

        case "keyword":
            keyword: str = rule.trigger_config.get("keyword", "").lower()
            transcript: str = event_data.get("transcript", "").lower()
            return bool(keyword) and keyword in transcript

        case "time_of_day":
            now = datetime.now(timezone.utc)
            start_str: str = rule.trigger_config.get("start", "00:00")
            end_str: str = rule.trigger_config.get("end", "23:59")
            now_minutes = now.hour * 60 + now.minute
            start_parts = start_str.split(":")
            end_parts = end_str.split(":")
            start_minutes = int(start_parts[0]) * 60 + int(start_parts[1])
            end_minutes = int(end_parts[0]) * 60 + int(end_parts[1])
            return start_minutes <= now_minutes <= end_minutes

        case _:
            return False


async def _execute_response_action(rule: ResponseRule) -> None:
    """Send the appropriate command to the station based on the rule's action."""
    from app.modules.station.commands import PlayCommand, RecordCommand
    from app.modules.station.websocket import connection_manager

    if not connection_manager.station_connected:
        logger.debug("Response action skipped: station not connected")
        return

    match rule.action_type:
        case "play_clip":
            clip_path: str = rule.action_config.get("clip_path", "")
            volume: float = rule.action_config.get("volume", 1.0)
            if clip_path:
                cmd = PlayCommand(clip_path=clip_path, volume=volume)
                await connection_manager.send_command(cmd)

        case "record":
            duration_ms: int = rule.action_config.get("duration_ms", 5000)
            cmd = RecordCommand(duration_ms=duration_ms)
            await connection_manager.send_command(cmd)

        case "start_session":
            session_id_str: str = rule.action_config.get("session_id", "")
            if session_id_str:
                from app.database import async_session_factory
                from app.modules.training import service as training_service

                async with async_session_factory() as db:
                    await training_service.start_session(
                        db, uuid.UUID(session_id_str)
                    )

        case "log":
            logger.info("Response rule '%s' triggered (log-only)", rule.name)


async def evaluate_event(
    db: AsyncSession, event_type: str, event_data: dict[str, Any]
) -> None:
    """Evaluate all active response rules against an incoming event."""
    stmt = select(ResponseRule).where(ResponseRule.is_active == True)  # noqa: E712
    result = await db.execute(stmt)
    rules = result.scalars().all()

    for rule in rules:
        if rule.trigger_type != event_type:
            continue
        if _is_in_cooldown(rule):
            continue
        if not _matches_trigger(rule, event_data):
            continue

        logger.info("Response rule '%s' matched event '%s'", rule.name, event_type)
        rule.times_triggered += 1
        _last_triggered[str(rule.id)] = datetime.now(timezone.utc)
        await _execute_response_action(rule)

    await db.flush()


# Register event bus handlers at import time
async def _on_sound_detected(data: dict[str, Any]) -> None:
    from app.database import async_session_factory

    async with async_session_factory() as db:
        await evaluate_event(db, "sound_detected", data)


async def _on_recording_ready(data: dict[str, Any]) -> None:
    from app.database import async_session_factory

    async with async_session_factory() as db:
        await evaluate_event(db, "recording_ready", data)


def register_event_handlers() -> None:
    event_bus.subscribe(EventType.SOUND_DETECTED, _on_sound_detected)
    event_bus.subscribe(EventType.RECORDING_READY, _on_recording_ready)
