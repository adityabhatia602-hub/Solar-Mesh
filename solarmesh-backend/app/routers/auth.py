"""Authentication endpoints: register, login, refresh, me."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.dependencies import get_current_user
from app.models import User, UserRole
from app.schemas import GoogleAuthRequest, RefreshRequest, TokenPair, UserCreate, UserLogin, UserOut
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.services.wallet_service import get_or_create_wallet

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_pair(user: User) -> TokenPair:
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        token=access_token,
        user=UserOut.model_validate(user),
    )


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=UserRole(payload.role),
    )
    db.add(user)
    db.flush()
    get_or_create_wallet(db, user.id)
    db.commit()
    db.refresh(user)
    return _token_pair(user)


@router.post("/login", response_model=TokenPair)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if user is None or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return _token_pair(user)


@router.post("/login-json", response_model=TokenPair)
def login_json(payload: UserLogin, db: Session = Depends(get_db)):
    """JSON-body login alternative for non-OAuth2 clients."""
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return _token_pair(user)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    data = decode_token(payload.refresh_token)
    if data is None or data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    user = db.get(User, data.get("sub", ""))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    return _token_pair(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/google", response_model=TokenPair)
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Verify Google OAuth2 ID token and authenticate or register user."""
    import secrets
    from google.oauth2 import id_token
    from google.auth.transport import requests as google_requests

    try:
        client_id = settings.GOOGLE_CLIENT_ID if settings.GOOGLE_CLIENT_ID else None
        id_info = id_token.verify_oauth2_token(
            payload.token,
            google_requests.Request(),
            audience=client_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {exc}",
        )

    email = id_info.get("email")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google token payload does not contain an email",
        )

    name = id_info.get("name") or email.split("@")[0]

    user = db.query(User).filter(User.email == email).first()
    if not user:
        random_pw = secrets.token_urlsafe(32)
        user = User(
            email=email,
            full_name=name,
            hashed_password=hash_password(random_pw),
            role=UserRole(payload.role),
        )
        db.add(user)
        db.flush()
        get_or_create_wallet(db, user.id)
        db.commit()
        db.refresh(user)
    elif not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account disabled",
        )

    return _token_pair(user)
