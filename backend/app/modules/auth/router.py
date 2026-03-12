from fastapi import APIRouter, Response
from pydantic import BaseModel

from app.config import settings
from app.modules.auth.service import (
    COOKIE_NAME,
    generate_token,
    get_cookie_max_age,
    validate_credentials,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    user: str
    password: str


class LoginResponse(BaseModel):
    user: str
    message: str


class MeResponse(BaseModel):
    user: str


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, response: Response) -> LoginResponse:
    """Validate credentials, set HTTP-only session cookie."""
    if not validate_credentials(body.user, body.password):
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = generate_token(body.user)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=get_cookie_max_age(),
        httponly=True,
        samesite="strict",
        secure=False,  # Set to True in production with HTTPS
        path="/",
    )
    return LoginResponse(user=body.user, message="Login successful")


@router.post("/logout")
async def logout(response: Response) -> dict[str, str]:
    """Clear the session cookie."""
    response.delete_cookie(
        key=COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="strict",
    )
    return {"message": "Logged out"}


@router.get("/me", response_model=MeResponse)
async def me() -> MeResponse:
    """Return current user. If this endpoint is reached, the user is authenticated."""
    return MeResponse(user=settings.AUTH_USER)
