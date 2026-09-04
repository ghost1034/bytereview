from __future__ import annotations

import logging
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.api import auth as auth_api
from app.api.router import api_router
from app.core import migrate
from app.core.config import get_settings
from app.core.db import engine
from app.core.errors import DomainError
from app.core.logging import configure_logging, request_id_ctx, user_id_ctx

APP_VERSION = "0.3.1"

settings = get_settings()
configure_logging(settings.log_level, settings.effective_log_format)
log = logging.getLogger("crm")

if settings.sentry_dsn:  # optional: pip install -e ".[observability]"
    try:
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.app_env, traces_sample_rate=settings.sentry_traces_sample_rate,
                        send_default_pii=False, release=f"{settings.app_name}@{APP_VERSION}")
        log.info("sentry enabled")
    except ImportError:  # pragma: no cover
        log.warning("SENTRY_DSN set but sentry-sdk is not installed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.validate_for_runtime()
    # Schema is owned by Alembic; startup never issues DDL. Refuse to start if the DB is behind.
    if not migrate.is_at_head(engine):
        msg = f"database schema is not at head (current={migrate.current_revision(engine)}, head={migrate.head_revision()}); run `alembic upgrade head`"
        if settings.is_production:
            raise RuntimeError(msg)
        log.warning(msg)
    log.info("startup env=%s", settings.app_env)
    yield


app = FastAPI(title=f"{settings.app_name} API", version=APP_VERSION,
              description="CRM for accounting, law, and professional-services firms.",
              lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True, allow_methods=["*"],
                   allow_headers=["*"])


@app.middleware("http")
async def request_context(request: Request, call_next):
    rid = (request.headers.get("x-request-id") or uuid.uuid4().hex[:16])[:64]
    token = request_id_ctx.set(rid)
    user_id_ctx.set(None)
    start = time.perf_counter()
    try:
        cl = request.headers.get("content-length")
        if cl and cl.isdigit() and int(cl) > settings.max_request_bytes:
            response = JSONResponse({"detail": "Request body too large", "code": "too_large", "request_id": rid}, status_code=413)
        else:
            response = await call_next(request)
    except Exception:
        log.exception("unhandled", extra={"method": request.method, "path": request.url.path})
        response = JSONResponse({"detail": "Internal server error", "request_id": rid}, status_code=500)
    duration = round((time.perf_counter() - start) * 1000, 1)
    response.headers["x-request-id"] = rid
    response.headers["x-content-type-options"] = "nosniff"
    response.headers["x-frame-options"] = "DENY"
    response.headers["referrer-policy"] = "same-origin"
    response.headers["permissions-policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["cache-control"] = response.headers.get("cache-control", "no-store")
    if request.url.path.startswith("/api/") and not request.url.path.startswith("/api/docs"):
        response.headers["content-security-policy"] = "default-src 'none'; frame-ancestors 'none'"
    if settings.is_production:
        response.headers["strict-transport-security"] = f"max-age={settings.hsts_seconds}; includeSubDomains"
    if request.url.path not in ("/api/health", "/api/ready"):
        user_id = getattr(request.state, "user_id", None)
        user_id_ctx.set(user_id)
        log.info("request", extra={"method": request.method, "path": request.url.path, "status": response.status_code,
                                   "duration_ms": duration, "ip": request.client.host if request.client else None,
                                   "ua": (request.headers.get("user-agent") or "")[:120]})
    request_id_ctx.reset(token)
    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    errors = [{"loc": ".".join(str(x) for x in e["loc"] if x != "body"), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
    return JSONResponse({"detail": "Validation failed: " + "; ".join(f"{e['loc']}: {e['msg']}" for e in errors[:5]),
                         "code": "validation_error", "errors": errors}, status_code=422)


@app.exception_handler(IntegrityError)
async def integrity_error_handler(_: Request, exc: IntegrityError):
    log.warning("integrity error: %s", str(exc.orig)[:200])
    return JSONResponse({"detail": "The change conflicts with an existing record (duplicate or referenced row).",
                         "code": "integrity_error"}, status_code=409)


@app.exception_handler(DomainError)
async def domain_error_handler(_: Request, exc: DomainError):
    return JSONResponse({"detail": exc.message, "code": exc.code}, status_code=exc.status_code)


@app.get("/api/health", tags=["ops"])
def health():
    """Liveness: process is up. Does not touch the database."""
    return {"status": "ok", "version": APP_VERSION}


@app.get("/api/ready", tags=["ops"])
def ready():
    """Readiness: database reachable and schema at the Alembic head. Use for load-balancer / k8s readiness probes."""
    checks: dict[str, bool | str] = {}
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception as e:  # pragma: no cover
        checks["database"] = False
        checks["database_error"] = type(e).__name__
    try:
        checks["migrations_at_head"] = migrate.is_at_head(engine)
    except Exception:  # pragma: no cover
        checks["migrations_at_head"] = False
    if settings.redis_url:
        checks["redis"] = auth_api._limiter.ping()
    checks["rate_limiter"] = auth_api._limiter.name
    ok = all(v is True for k, v in checks.items() if not k.endswith("_error") and k != "rate_limiter")
    return JSONResponse({"status": "ready" if ok else "not_ready", "checks": checks, "env": settings.app_env, "version": APP_VERSION},
                        status_code=200 if ok else 503)


app.include_router(api_router, prefix="/api")
