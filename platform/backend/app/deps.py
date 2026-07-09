"""Shared dependencies: current authenticated user from the access token."""
from fastapi import Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from .database import get_db
from . import models, security


def current_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> models.User:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.split(" ", 1)[1]
    try:
        claims = security.decode_access_token(token)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(models.User, claims["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    return user


def optional_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> models.User | None:
    """Current user if a valid token is present, else None (for public endpoints)."""
    if not authorization.lower().startswith("bearer "):
        return None
    try:
        claims = security.decode_access_token(authorization.split(" ", 1)[1])
        user = db.get(models.User, claims["sub"])
        return user if user and user.is_active else None
    except Exception:
        return None


def require_role(*roles: str):
    def _dep(user: models.User = Depends(current_user)) -> models.User:
        if roles and user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user
    return _dep
