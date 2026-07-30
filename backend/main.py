import os
import logging
from typing import Callable, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer
from dotenv import load_dotenv
import stripe

from core.runtime import environment, is_production

# Load .env only for local/dev; Cloud Run uses env vars
load_dotenv()

# ---------- Logging config (stdout/stderr for Cloud Run) ----------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("main")

# ---------- Optional DB bootstrap (disable in prod; run Alembic instead) ----------
INIT_DB_AT_STARTUP = os.getenv("INIT_DB_AT_STARTUP", "false").lower() == "true"
db_init_fn: Optional[Callable[[], None]] = None
if INIT_DB_AT_STARTUP:
    try:
        from core.database import init_database as init_database_func

        db_init_fn = init_database_func
    except Exception as e:
        logger.exception("Failed importing init_database at module import time")
        raise

# ---------- App ----------
app = FastAPI(
    title="CPAAutomation API",
    version="1.0.0",
    description="AI-powered document data extraction service for CPAs and accounting professionals",
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ---------- CORS ----------
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5000",
    "http://127.0.0.1:5000",
]
if is_production():
    allowed_origins = [
        "https://cpaautomation.ai",
        "https://www.cpaautomation.ai",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ---------- Stripe ----------
# Environment-based configuration (consistent with other settings)
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
if not stripe.api_key:
    if is_production():
        logger.critical("STRIPE_SECRET_KEY is missing")
        raise RuntimeError("STRIPE_SECRET_KEY environment variable is required in production")
    logger.warning("STRIPE_SECRET_KEY is not set; billing actions are disabled locally")

# ---------- Security ----------
security = HTTPBearer(auto_error=False)

# ---------- Global error handler (ensure clear logs on 500s) ----------
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Internal Server Error"}, status_code=500)

# ---------- Health & root ----------
@app.get("/")
async def root():
    return {"message": "CPAAutomation API is running", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# ---------- Lifespan logs ----------
@app.on_event("startup")
async def on_startup():
    logger.info("Starting CPAAutomation API...")
    logger.info(
        "ENVIRONMENT=%s, LOG_LEVEL=%s, INIT_DB_AT_STARTUP=%s",
        environment(),
        LOG_LEVEL,
        INIT_DB_AT_STARTUP,
    )
    try:
        from inkwise.settings import get_inkwise_settings

        inkwise_settings = get_inkwise_settings()
        logger.info(
            "Inkwise retrieval config: query_rewrite=%s lexical_fusion=%s vector_rerank=%s vector_top_k=%s lexical_top_k=%s diversity_per_source_top_k=%s max_balanced_per_source=%s diversity_score_margin=%s rerank_top_k=%s rerank_model=%s",
            inkwise_settings.query_rewrite_enabled,
            inkwise_settings.use_lexical_fusion,
            inkwise_settings.use_vector_rerank,
            inkwise_settings.vector_search_top_k,
            inkwise_settings.lexical_search_top_k,
            inkwise_settings.diversity_per_source_top_k,
            inkwise_settings.max_balanced_evidence_per_source,
            inkwise_settings.diversity_vector_score_margin,
            inkwise_settings.rerank_top_k,
            inkwise_settings.vector_rerank_model,
        )
    except Exception:
        logger.exception("Failed to log Inkwise retrieval settings")
    if INIT_DB_AT_STARTUP:
        try:
            logger.info("Initializing database (INIT_DB_AT_STARTUP=true)...")
            if db_init_fn is None:
                raise RuntimeError("init_database is not available")
            db_init_fn()
            logger.info("Database initialized successfully")
        except Exception:
            logger.exception("Database initialization failed")
            # re-raise to fail fast in startup
            raise
    logger.info("Startup complete")

@app.on_event("shutdown")
async def on_shutdown():
    logger.info("Shutting down CPAAutomation API...")

# ---------- Routers (import after app/init so import errors are logged nicely) ----------
from routes import (
    users, jobs, stripe_routes, templates,
    data_types, integrations, automations, webhooks, admin, billing, contact, cpe, form_fill, esign,
    analytics_firms, analytics_clients, analytics_research,
    analytics_assistant, analytics_waterfall, analytics_amortization,
    analytics_reconciliation, analytics_variance, analytics_comments, activation,
    chrona_devices, chrona_sync, chrona_dashboard, connector, local_storage,
    tasklytic,
)
from inkwise.router import router as inkwise_router

app.include_router(users.router,        prefix="/api/users",      tags=["users"])
app.include_router(jobs.router,         prefix="/api/jobs",       tags=["jobs"])
app.include_router(cpe.router,          prefix="/api/cpe",        tags=["cpe"])
app.include_router(stripe_routes.router, prefix="/api/stripe",    tags=["stripe"])
app.include_router(billing.router)
app.include_router(templates.router,    prefix="/api/templates",  tags=["templates"])
app.include_router(data_types.router,   prefix="/api/data-types", tags=["data-types"])
app.include_router(integrations.router, prefix="/api",            tags=["integrations"])
app.include_router(automations.router)
app.include_router(webhooks.router)
app.include_router(admin.router)
app.include_router(contact.router)
app.include_router(form_fill.router, prefix="/api/form-fill", tags=["form-fill"])
app.include_router(esign.router, prefix="/api/esign", tags=["esign"])
app.include_router(inkwise_router, prefix="/api/inkwise")
app.include_router(analytics_firms.router)
app.include_router(analytics_clients.router)
app.include_router(analytics_research.router)
app.include_router(analytics_assistant.router)
app.include_router(analytics_waterfall.router)
app.include_router(analytics_amortization.router)
app.include_router(analytics_reconciliation.router)
app.include_router(analytics_variance.router)
app.include_router(analytics_comments.router)
app.include_router(activation.router)
app.include_router(connector.router)
app.include_router(connector.admin_router)
app.include_router(chrona_devices.router)
app.include_router(chrona_sync.router)
app.include_router(chrona_dashboard.router)
app.include_router(local_storage.router, prefix="/api/local-storage", tags=["local-development"])
app.include_router(tasklytic.router)

# ---------- Dev entrypoint (Cloud Run ignores this; CMD in Dockerfile is used) ----------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("RELOAD", "false").lower() == "true",
        log_level=LOG_LEVEL.lower(),
    )
