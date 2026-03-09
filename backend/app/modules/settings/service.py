import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.settings.models import UserSettings
from app.modules.settings.schemas import SettingPublicResponse

logger = logging.getLogger(__name__)

# Default settings that should exist
DEFAULT_SETTINGS = [
    {
        "key": "openai_api_key",
        "label": "OpenAI API Key (Whisper)",
        "category": "ai",
        "is_secret": True,
    },
    {
        "key": "elevenlabs_api_key",
        "label": "ElevenLabs API Key",
        "category": "ai",
        "is_secret": True,
    },
    {
        "key": "elevenlabs_voice_id",
        "label": "ElevenLabs Voice ID",
        "category": "ai",
        "is_secret": False,
    },
    {
        "key": "gemini_api_key",
        "label": "Gemini API Key",
        "category": "ai",
        "is_secret": True,
    },
    {
        "key": "station_name",
        "label": "Nombre de la estacion",
        "category": "general",
        "is_secret": False,
    },
    {
        "key": "timezone",
        "label": "Zona horaria",
        "category": "general",
        "is_secret": False,
    },
    {
        "key": "detection_threshold",
        "label": "Umbral de deteccion de sonido (0.0 - 1.0)",
        "category": "station",
        "is_secret": False,
    },
    {
        "key": "default_volume",
        "label": "Volumen por defecto (0.0 - 1.0)",
        "category": "station",
        "is_secret": False,
    },
]


async def ensure_defaults(db: AsyncSession) -> None:
    """Create default settings rows if they don't exist."""
    for setting_def in DEFAULT_SETTINGS:
        result = await db.execute(
            select(UserSettings).where(UserSettings.key == setting_def["key"])
        )
        if result.scalar_one_or_none() is None:
            setting = UserSettings(
                key=setting_def["key"],
                value="",
                label=setting_def["label"],
                category=setting_def["category"],
                is_secret=setting_def["is_secret"],
            )
            db.add(setting)
    await db.flush()
    logger.info("Default settings ensured")


def _mask_value(value: str) -> str:
    """Mask a secret value, showing only last 4 chars."""
    if not value or len(value) <= 4:
        return "*" * len(value) if value else ""
    return "*" * (len(value) - 4) + value[-4:]


async def list_settings(
    db: AsyncSession, category: str | None = None
) -> list[SettingPublicResponse]:
    stmt = select(UserSettings).order_by(UserSettings.category, UserSettings.key)
    if category:
        stmt = stmt.where(UserSettings.category == category)
    result = await db.execute(stmt)
    settings = result.scalars().all()

    return [
        SettingPublicResponse(
            key=s.key,
            value=_mask_value(s.value) if s.is_secret else s.value,
            label=s.label,
            category=s.category,
            is_secret=s.is_secret,
            is_configured=bool(s.value),
            updated_at=s.updated_at,
        )
        for s in settings
    ]


async def get_setting(db: AsyncSession, key: str) -> UserSettings | None:
    result = await db.execute(
        select(UserSettings).where(UserSettings.key == key)
    )
    return result.scalar_one_or_none()


async def get_setting_value(db: AsyncSession, key: str) -> str:
    """Get raw setting value. Used internally by AI clients."""
    setting = await get_setting(db, key)
    return setting.value if setting else ""


async def update_setting(db: AsyncSession, key: str, value: str) -> UserSettings:
    setting = await get_setting(db, key)
    if setting is None:
        setting = UserSettings(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
        setting.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(setting)
    return setting
