from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.modules.settings import service
from app.modules.settings.schemas import SettingPublicResponse, SettingUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/", response_model=list[SettingPublicResponse])
async def list_settings(
    category: str | None = Query(default=None),
    db: AsyncSession = Depends(get_session),
) -> list[SettingPublicResponse]:
    """List all settings with masked secret values."""
    return await service.list_settings(db, category=category)


@router.put("/{key}", response_model=SettingPublicResponse)
async def update_setting(
    key: str,
    data: SettingUpdate,
    db: AsyncSession = Depends(get_session),
) -> SettingPublicResponse:
    """Update a setting value."""
    setting = await service.update_setting(db, key, data.value)
    masked_value = service._mask_value(setting.value) if setting.is_secret else setting.value
    return SettingPublicResponse(
        key=setting.key,
        value=masked_value,
        label=setting.label,
        category=setting.category,
        is_secret=setting.is_secret,
        is_configured=bool(setting.value),
        updated_at=setting.updated_at,
    )


@router.post("/test/{key}")
async def test_api_key(
    key: str,
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool | str]:
    """Test if an API key is valid by making a lightweight API call."""
    value = await service.get_setting_value(db, key)
    if not value:
        return {"valid": False, "message": "API key not configured"}

    try:
        if key == "openai_api_key":
            import httpx
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://api.openai.com/v1/models",
                    headers={"Authorization": f"Bearer {value}"},
                )
            return {"valid": resp.status_code == 200, "message": "OK" if resp.status_code == 200 else f"Error {resp.status_code}"}

        elif key == "elevenlabs_api_key":
            import httpx
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://api.elevenlabs.io/v1/voices",
                    headers={"xi-api-key": value},
                )
            return {"valid": resp.status_code == 200, "message": "OK" if resp.status_code == 200 else f"Error {resp.status_code}"}

        elif key == "gemini_api_key":
            import httpx
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"https://generativelanguage.googleapis.com/v1beta/models?key={value}",
                )
            return {"valid": resp.status_code == 200, "message": "OK" if resp.status_code == 200 else f"Error {resp.status_code}"}

        elif key == "elevenlabs_voice_id":
            # Test voice ID by generating a tiny speech sample
            el_key = await service.get_setting_value(db, "elevenlabs_api_key")
            if not el_key:
                return {"valid": False, "message": "Configura primero la API key de ElevenLabs"}
            import httpx
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{value}",
                    headers={"xi-api-key": el_key, "Content-Type": "application/json"},
                    json={"text": "Hola", "model_id": "eleven_multilingual_v2"},
                )
            if resp.status_code == 200:
                return {"valid": True, "message": "Voice ID valido - audio generado correctamente"}
            elif resp.status_code == 404:
                return {"valid": False, "message": "Voice ID no encontrado"}
            else:
                return {"valid": False, "message": f"Error {resp.status_code}"}

        else:
            return {"valid": False, "message": "No test available for this key"}

    except Exception as exc:
        return {"valid": False, "message": str(exc)}
