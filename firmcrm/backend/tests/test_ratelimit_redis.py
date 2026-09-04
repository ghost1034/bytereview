import fakeredis

from app.services.ratelimit import RedisRateLimiter, build_limiter


def test_redis_limiter_shared_window_and_reset():
    r = fakeredis.FakeRedis(decode_responses=True)
    a = RedisRateLimiter(r, limit=3, window_seconds=60)
    b = RedisRateLimiter(r, limit=3, window_seconds=60)  # second "worker" sharing the store
    assert a.allow("ip1") and b.allow("ip1") and a.allow("ip1")
    assert b.allow("ip1") is False  # 4th hit across workers is blocked
    assert a.allow("ip2") is True
    a.reset("ip1")
    assert b.allow("ip1") is True
    assert a.ping() is True


def test_redis_limiter_fails_open_when_backend_down():
    class Broken:
        def pipeline(self):
            raise ConnectionError("down")

        def ping(self):
            raise ConnectionError("down")

        def delete(self, *_):
            raise ConnectionError("down")

    lim = RedisRateLimiter(Broken(), limit=1)
    assert lim.allow("x") is True and lim.allow("x") is True
    assert lim.ping() is False
    lim.reset("x")


def test_build_limiter_picks_backend():
    assert build_limiter(5, 60, None).name == "memory"
    assert build_limiter(5, 60, "redis://localhost:6379/0").name == "redis"


def test_ready_reports_rate_limiter_backend(client):
    body = client.get("/api/ready").json()
    assert body["checks"]["rate_limiter"] == "memory" and body["status"] == "ready"
