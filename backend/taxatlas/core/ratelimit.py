"""Fixed-window rate limiter keyed by API key / user / client IP.

Two backends with identical semantics (`Verdict`: allowed, limit, remaining, reset_seconds; windows are aligned to
the wall-clock minute so `reset_seconds` is the time to the next boundary):

- `RateLimiter` (default): process-local dict. Every uvicorn worker and every replica counts separately, so the
  effective limit is N x the configured value.
- `RedisRateLimiter` (when `REDIS_URL` is set): one `INCR` + `EXPIRE` per request on a key that embeds the window
  number, so all workers/replicas share one bucket. **Fails open**: if Redis is unreachable or errors at call
  time, the request is counted in the local `RateLimiter` instead and a warning is logged (at most once per
  `_FALLBACK_LOG_INTERVAL` seconds). Availability over strictness: a Redis outage degrades to per-process limits,
  it never turns into a 5xx or a hard block.

`client_ip()` is the single place that decides which address identifies an anonymous caller (the access log
uses it too). It only honours proxy headers when the deployment declares a trusted reverse proxy in front of
the API, and then only the value that proxy itself wrote (X-Real-IP / last X-Forwarded-For hop); otherwise any
client could spoof the header and escape per-IP limits (or pin them on a victim).
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from typing import Any, Protocol

from fastapi import Request

log = logging.getLogger("taxatlas.ratelimit")

WINDOW_SECONDS = 60
REDIS_KEY_PREFIX = "taxatlas:rl:"
_REDIS_TTL = WINDOW_SECONDS + 5  # a little past the window so a late INCR never resurrects an expired bucket
_FALLBACK_LOG_INTERVAL = 30.0


@dataclass
class Verdict:
    allowed: bool
    limit: int
    remaining: int
    reset_seconds: int


def _window(now: float) -> tuple[int, int]:
    """(window number, seconds until the window rolls over) for a minute-aligned fixed window."""
    n = int(now)
    return n // WINDOW_SECONDS, WINDOW_SECONDS - (n % WINDOW_SECONDS)


def _verdict(count: int, limit: int, reset: int) -> Verdict:
    return Verdict(allowed=count <= limit, limit=limit, remaining=max(0, limit - count), reset_seconds=reset)


class Limiter(Protocol):
    def check(self, key: str, limit: int) -> Verdict: ...

    def reset(self) -> None: ...


class RateLimiter:
    """Process-local fixed-window counters."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._buckets: dict[str, tuple[int, int]] = {}  # key -> (window number, count)

    def check(self, key: str, limit: int) -> Verdict:
        window, reset = _window(time.time())
        with self._lock:
            start, count = self._buckets.get(key, (window, 0))
            if start != window:
                start, count = window, 0
            count += 1
            self._buckets[key] = (start, count)
            if len(self._buckets) > 50_000:  # crude memory guard: drop every bucket from past windows
                self._buckets = {k: v for k, v in self._buckets.items() if v[0] == window}
        return _verdict(count, limit, reset)

    def reset(self) -> None:
        """Clear all buckets (tests)."""
        with self._lock:
            self._buckets = {}


class RedisRateLimiter:
    """Shared fixed-window counters in Redis; falls back to a local `RateLimiter` when Redis is unavailable.

    `client` is any object with the redis-py `pipeline()` API (`incr`, `expire`, `execute`) and `scan_iter` /
    `delete` for `reset()`; tests pass an in-memory fake.
    """

    def __init__(self, client: Any, *, fallback: RateLimiter | None = None) -> None:
        self._client = client
        self.fallback = fallback or RateLimiter()
        self._last_fallback_log = 0.0
        self.fallback_count = 0  # requests served by the local limiter because Redis failed (diagnostics/tests)

    def check(self, key: str, limit: int) -> Verdict:
        window, reset = _window(time.time())
        redis_key = f"{REDIS_KEY_PREFIX}{window}:{key}"
        try:
            pipe = self._client.pipeline()
            pipe.incr(redis_key)
            pipe.expire(redis_key, _REDIS_TTL)
            count = int(pipe.execute()[0])
        except Exception as exc:  # connection refused, timeout, auth, ... -> fail open to local counters
            self._note_fallback(exc)
            return self.fallback.check(key, limit)
        return _verdict(count, limit, reset)

    def _note_fallback(self, exc: Exception) -> None:
        self.fallback_count += 1
        now = time.monotonic()
        if now - self._last_fallback_log >= _FALLBACK_LOG_INTERVAL:
            self._last_fallback_log = now
            log.warning(
                "rate limiter: Redis unavailable (%s: %s); using process-local counters until it recovers",
                type(exc).__name__,
                exc,
            )

    def reset(self) -> None:
        """Delete every limiter key and clear the local fallback (tests / ops)."""
        self.fallback.reset()
        try:
            keys = list(self._client.scan_iter(match=f"{REDIS_KEY_PREFIX}*"))
            if keys:
                self._client.delete(*keys)
        except Exception as exc:
            self._note_fallback(exc)


def build_limiter(redis_url: str = "") -> Limiter:
    """Pick the backend from configuration. Connection problems are deferred to the first `check()` (fail-open)."""
    if not redis_url:
        return RateLimiter()
    import redis  # imported lazily so the default deployment does not need the dependency loaded

    client = redis.Redis.from_url(
        redis_url,
        socket_connect_timeout=0.25,
        socket_timeout=0.25,
        retry_on_timeout=False,
        health_check_interval=30,
        decode_responses=False,
    )
    log.info("rate limiter: shared Redis counters (%s)", _redact(redis_url))
    return RedisRateLimiter(client)


def _redact(url: str) -> str:
    if "@" in url and "//" in url:
        scheme, rest = url.split("//", 1)
        return f"{scheme}//***@{rest.rsplit('@', 1)[-1]}"
    return url


def _default_limiter() -> Limiter:
    from taxatlas.core.config import get_settings

    return build_limiter(get_settings().redis_url)


limiter: Limiter = _default_limiter()


def client_ip(request: Request, trusted_proxy: bool = False) -> str:
    """Best-effort client address for anonymous rate-limit keys and the access log.

    With `trusted_proxy=True` the address written by the *immediate* proxy is used, in this order:
      1. `X-Real-IP` — nginx sets it to its own socket peer (`$remote_addr`), so a client cannot forge it;
      2. the **last** `X-Forwarded-For` hop — the entry the trusted proxy appended (`proxy_add_x_forwarded_for`).
    The first/left-most XFF entry is whatever the client sent and must never be trusted: keying on it would let
    anyone rotate their rate-limit bucket (or pin a victim's) with one header. Behind a multi-hop chain (LB ->
    nginx), configure nginx's realip module (`set_real_ip_from` + `real_ip_header X-Forwarded-For`) so
    `$remote_addr`, and therefore both headers above, already hold the true client.
    Without a trusted proxy the transport peer address is used and the headers are ignored.
    """
    if trusted_proxy:
        real_ip = request.headers.get("x-real-ip")
        if real_ip and real_ip.strip():
            return real_ip.strip()[:64]
        xff = request.headers.get("x-forwarded-for")
        if xff:
            last = xff.rsplit(",", 1)[-1].strip()
            if last:
                return last[:64]
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


__all__ = [
    "Limiter",
    "RateLimiter",
    "RedisRateLimiter",
    "Verdict",
    "build_limiter",
    "client_ip",
    "limiter",
]
