"""
Minimal in-process sliding-window rate limiter.

Intentionally dependency-free and process-local. It is suitable for throttling
abuse on a single instance (e.g. brute-forcing the activation code or hammering
the resolve endpoint). It is NOT a distributed limiter — behind multiple Cloud
Run instances each process keeps its own window, which is acceptable as a
best-effort brute-force/DoS mitigation here. For hard, cross-instance guarantees
later, back this with Redis or a managed rate limiter.
"""
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple


class SlidingWindowRateLimiter:
    def __init__(self):
        self._hits: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, scope: str, identity: str, limit: int, window_seconds: float) -> bool:
        """Record a hit and return True if it is allowed, False if rate-limited.

        ``scope`` groups a limit category (e.g. "activate", "resolve_ip") and
        ``identity`` is the throttled subject (user id, client ip, key lookup).
        """
        key = (scope, identity)
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            bucket = self._hits[key]
            while bucket and bucket[0] < cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            # Opportunistic cleanup so the dict does not grow unbounded.
            if not bucket:
                del self._hits[key]
            return True


# Shared process-wide limiter instance.
rate_limiter = SlidingWindowRateLimiter()
