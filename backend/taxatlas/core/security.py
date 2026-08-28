"""API-key generation and hashing for TaxAtlas machine access."""

from __future__ import annotations

import hashlib
import secrets

API_KEY_PREFIX = "ta_"


def hash_api_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def generate_api_key() -> tuple[str, str, str]:
    key = f"{API_KEY_PREFIX}{secrets.token_urlsafe(32)}"
    return key, key[:11], hash_api_key(key)

