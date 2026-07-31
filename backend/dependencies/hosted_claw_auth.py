"""Google service-identity authentication for hosted-Claw worker APIs."""

from __future__ import annotations

import asyncio
import hmac
import os

from fastapi import HTTPException, Request

from core.runtime import is_local


async def require_hosted_worker(request: Request) -> dict:
    authorization = (request.headers.get("authorization") or "").strip()
    token = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    if not token:
        raise HTTPException(status_code=401, detail="Worker identity required")

    # Explicit local-only escape hatch for supervisor development and tests.
    local_token = os.getenv("HOSTED_CLAW_LOCAL_WORKER_TOKEN", "")
    if is_local() and local_token and hmac.compare_digest(token, local_token):
        return {"sub": "local-hosted-worker", "email": "local"}

    audience = os.getenv("HOSTED_CLAW_INTERNAL_AUDIENCE", "").strip()
    allowed_sa = os.getenv("HOSTED_CLAW_WORKER_SERVICE_ACCOUNT", "").strip()
    if not audience or not allowed_sa:
        raise HTTPException(status_code=503, detail="Worker identity is not configured")
    try:
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2 import id_token

        claims = await asyncio.to_thread(id_token.verify_oauth2_token, token, GoogleRequest(), audience)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid worker identity")
    if claims.get("email") != allowed_sa or claims.get("email_verified") is not True:
        raise HTTPException(status_code=403, detail="Worker service account is not authorized")
    return claims
