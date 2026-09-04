from __future__ import annotations

import hashlib
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import get_settings
from app.core.errors import DomainError


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(get_settings().bcrypt_rounds)).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def create_access_token(user_id: int, role: str, *, pw_changed_at: datetime | None = None, session_id: str | None = None) -> str:
    s = get_settings()
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "role": role, "typ": "access", "jti": uuid.uuid4().hex, "iat": now,
               "exp": now + timedelta(minutes=s.access_token_minutes),
               # Tokens issued before a password change are rejected (see deps.get_current_user).
               "pwc": int(pw_changed_at.replace(tzinfo=UTC).timestamp()) if pw_changed_at else 0,
               # Session binding: the refresh-token family this access token belongs to. Revoking the session kills it immediately.
               "sid": session_id}
    return jwt.encode(payload, s.secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"], options={"require": ["exp", "sub"]})
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return payload


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def validate_password_policy(password: str, *, email: str | None = None) -> None:
    s = get_settings()
    problems = []
    if len(password) < s.password_min_length:
        problems.append(f"at least {s.password_min_length} characters")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
        problems.append("both letters and digits")
    if email:
        local = email.split("@")[0].lower()
        if len(local) >= 4 and local in password.lower():
            problems.append("must not contain your email name")
    if password.lower() in {"password1234", "changeme12345", "welcome12345"}:
        problems.append("must not be a common password")
    if problems:
        raise DomainError("Password does not meet policy: " + "; ".join(problems), code="weak_password")
