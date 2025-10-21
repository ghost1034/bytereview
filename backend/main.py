import os
import logging
from typing import Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer
from dotenv import load_dotenv
import stripe

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
if INIT_DB_AT_STARTUP:
    try:
        from core.database import init_database
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
allowed_origins = ["http://localhost:3000", "http://localhost:5000"]
if os.getenv("ENVIRONMENT") == "production":
    allowed_origins = [
        "https://cpaautomation.ai",
        "https://www.cpaautomation.ai",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ---------- Stripe ----------
# Environment-based configuration (consistent with other settings)
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
if not stripe.api_key:
    logger.critical("STRIPE_SECRET_KEY is missing")
    raise RuntimeError("STRIPE_SECRET_KEY environment variable is required")

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
        os.getenv("ENVIRONMENT"),
        LOG_LEVEL,
        INIT_DB_AT_STARTUP,
    )
    if INIT_DB_AT_STARTUP:
        try:
            logger.info("Initializing database (INIT_DB_AT_STARTUP=true)...")
            init_database()
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
    users, jobs, stripe_routes, extraction, templates,
    data_types, integrations, automations, webhooks, admin, billing, contact
)

app.include_router(users.router,        prefix="/api/users",      tags=["users"])
app.include_router(jobs.router,         prefix="/api/jobs",       tags=["jobs"])
app.include_router(stripe_routes.router, prefix="/api/stripe",    tags=["stripe"])
app.include_router(billing.router)
app.include_router(extraction.router,   prefix="/api/extraction", tags=["extraction"])
app.include_router(templates.router,    prefix="/api/templates",  tags=["templates"])
app.include_router(data_types.router,   prefix="/api/data-types", tags=["data-types"])
app.include_router(integrations.router, prefix="/api",            tags=["integrations"])
app.include_router(automations.router)
app.include_router(webhooks.router)
app.include_router(admin.router)
app.include_router(contact.router)

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