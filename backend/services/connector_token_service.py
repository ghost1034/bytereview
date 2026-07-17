"""
Minting and validation of connector tokens (``cpaa_conn_…``) — the per-user
bearer tokens Claw containers use against the MCP proxy at /api/connector/mcp.

Storage mirrors the ActivationKey scheme (routes/activation.py): only a
SHA-256 hash is persisted, with a non-secret indexed prefix for O(1) lookup and
a constant-time comparison at validation time. The plaintext token exists only
in the mint response (shown once in the UI, or delivered to the container via
the activation resolve exchange).
"""
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from models.db_models import ConnectorToken
from services.rate_limit import rate_limiter

logger = logging.getLogger(__name__)

TOKEN_PREFIX = "cpaa_conn_"
LOOKUP_LEN = 12


def _hash_token(full_token: str) -> str:
    return hashlib.sha256(full_token.encode("utf-8")).hexdigest()


def mint_token(db, user_id: str, name: Optional[str] = None, rotate_same_name: bool = False) -> tuple[str, ConnectorToken]:
    """Create a token row; returns (plaintext_token, row). Does not commit.

    With ``rotate_same_name`` any earlier unrevoked tokens with the same name
    are revoked first — used by Claw activation so each container re-activation
    replaces its predecessor instead of accumulating live credentials.
    """
    if rotate_same_name and name:
        db.query(ConnectorToken).filter(
            ConnectorToken.user_id == user_id,
            ConnectorToken.name == name,
            ConnectorToken.revoked_at.is_(None),
        ).update({ConnectorToken.revoked_at: datetime.now(timezone.utc)})

    secret_part = secrets.token_urlsafe(32)
    full_token = TOKEN_PREFIX + secret_part
    row = ConnectorToken(
        user_id=user_id,
        token_lookup=secret_part[:LOOKUP_LEN],
        token_hash=_hash_token(full_token),
        token_prefix=f"{TOKEN_PREFIX}{secret_part[:4]}…",
        name=name,
    )
    db.add(row)
    return full_token, row


def validate_token(db, submitted: str, ip: str) -> Optional[ConnectorToken]:
    """Return the live ConnectorToken row for a submitted bearer, else None.

    Rate-limits by token lookup and by IP so the proxy cannot be used to
    brute-force the token space. Stamps last_used_at (caller commits).
    """
    if not rate_limiter.check("connector_mcp_ip", ip, limit=120, window_seconds=60):
        return None
    if not submitted or not submitted.startswith(TOKEN_PREFIX):
        return None
    lookup = submitted[len(TOKEN_PREFIX):][:LOOKUP_LEN]
    if not lookup or not rate_limiter.check("connector_mcp_token", lookup, limit=120, window_seconds=60):
        return None

    row = (
        db.query(ConnectorToken)
        .filter(ConnectorToken.token_lookup == lookup, ConnectorToken.revoked_at.is_(None))
        .first()
    )
    if not row or not hmac.compare_digest(row.token_hash, _hash_token(submitted)):
        logger.info("Connector token rejected lookup=%s ip=%s", lookup, ip)
        return None
    row.last_used_at = datetime.now(timezone.utc)
    return row
