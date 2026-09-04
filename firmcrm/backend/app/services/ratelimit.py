"""Fixed-window rate limiting keyed by an arbitrary string (client IP).

Two implementations behind one interface:
- RateLimiter: in-process. Correct for a single process; with N workers/replicas the effective limit is N×.
- RedisRateLimiter: shared across processes via INCR + EXPIRE. Used automatically when REDIS_URL is set.

Both fail open on backend errors (a Redis outage must not lock everyone out) and log the failure.
"""

from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict
from typing import Protocol

log = logging.getLogger("crm.ratelimit")


class Limiter(Protocol):
    def allow(self, key: str) -> bool: ...
    def reset(self, key: str) -> None: ...
    def ping(self) -> bool: ...
    name: str


class RateLimiter:
    name = "memory"

    def __init__(self, limit: int, window_seconds: int = 60):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = [t for t in self._hits[key] if now - t < self.window]
            if len(hits) >= self.limit:
                self._hits[key] = hits
                return False
            hits.append(now)
            self._hits[key] = hits
            if len(self._hits) > 10_000:  # opportunistic cleanup
                for k in [k for k, v in self._hits.items() if not v or now - v[-1] > self.window]:
                    self._hits.pop(k, None)
            return True

    def reset(self, key: str) -> None:
        with self._lock:
            self._hits.pop(key, None)

    def ping(self) -> bool:
        return True


class RedisRateLimiter:
    name = "redis"

    def __init__(self, client, limit: int, window_seconds: int = 60, prefix: str = "crm:rl:"):
        self.r = client
        self.limit = limit
        self.window = window_seconds
        self.prefix = prefix

    def _key(self, key: str) -> str:
        bucket = int(time.time() // self.window)
        return f"{self.prefix}{key}:{bucket}"

    def allow(self, key: str) -> bool:
        try:
            k = self._key(key)
            pipe = self.r.pipeline()
            pipe.incr(k)
            pipe.expire(k, self.window + 1)
            count, _ = pipe.execute()
            return int(count) <= self.limit
        except Exception as e:  # noqa: BLE001 - fail open, but loudly
            log.error("redis rate limiter unavailable (%s); allowing request", type(e).__name__)
            return True

    def reset(self, key: str) -> None:
        try:
            self.r.delete(self._key(key))
        except Exception:  # noqa: BLE001
            pass

    def ping(self) -> bool:
        try:
            return bool(self.r.ping())
        except Exception:  # noqa: BLE001
            return False


def build_limiter(limit: int, window_seconds: int = 60, redis_url: str | None = None) -> Limiter:
    if redis_url:
        import redis

        client = redis.Redis.from_url(redis_url, socket_connect_timeout=1, socket_timeout=1, decode_responses=True)
        return RedisRateLimiter(client, limit, window_seconds)
    return RateLimiter(limit, window_seconds)
