"""Device-token authentication for Chrona sync endpoints.

Chrona installs authenticate with ``Authorization: Bearer chrona_dev_<random>``
— NOT Firebase. Verification mirrors the activation-key resolve flow
(routes/activation.py): indexed lookup by the non-secret token prefix, then a
constant-time hash comparison. Unknown, revoked, and malformed tokens all get
the same generic 401 so the endpoint does not reveal which tokens exist.
"""

from __future__ import annotations

import hmac
import logging

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from core.database import get_db
from models.db_models import ChronaDevice
from services.chrona.devices_service import hash_token, lookup_from_submitted
from services.rate_limit import rate_limiter

logger = logging.getLogger(__name__)

# auto_error=False so we can return our own generic 401 for missing headers.
_bearer = HTTPBearer(auto_error=False)

_GENERIC_401 = HTTPException(status_code=401, detail="Invalid or revoked device token.")


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def verify_device_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> ChronaDevice:
    """Resolve and verify the bearer device token; return the live device row.

    Rate-limited per IP and per token lookup (best-effort, per-instance — see
    services/rate_limit.py). Revocation is immediate: the lookup filters on
    ``revoked_at IS NULL``.
    """
    ip = _client_ip(request)
    if not rate_limiter.check("chrona_sync_ip", ip, limit=120, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests.")

    if credentials is None or not credentials.credentials:
        raise _GENERIC_401

    submitted = credentials.credentials
    lookup = lookup_from_submitted(submitted)
    if not lookup:
        raise _GENERIC_401

    if not rate_limiter.check("chrona_sync_token", lookup, limit=60, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests.")

    device = (
        db.query(ChronaDevice)
        .filter(ChronaDevice.token_lookup == lookup, ChronaDevice.revoked_at.is_(None))
        .first()
    )
    if not device or not hmac.compare_digest(device.token_hash, hash_token(submitted)):
        logger.info("Chrona sync rejected token_lookup=%s ip=%s", lookup, ip)
        raise _GENERIC_401

    return device
