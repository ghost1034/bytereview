from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
from dotenv import load_dotenv
import stripe
from typing import Optional
import uvicorn
import atexit
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import database initialization
from core.database import init_database

# Initialize FastAPI app
app = FastAPI(
    title="ByteReview API", 
    version="2.0.0",
    description="AI-powered document data extraction service with asynchronous job processing",
    openapi_url="/api/openapi.json",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# Initialize database on startup
@app.on_event("startup")
async def startup_event():
    """Initialize database and other startup tasks"""
    try:
        logger.info("Initializing database...")
        init_database()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise  # Fail fast if database is unavailable

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Initialize Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
if not stripe.api_key:
    raise ValueError("STRIPE_SECRET_KEY environment variable is required")

# Security
security = HTTPBearer(auto_error=False)

@app.get("/")
async def root():
    return {"message": "ByteReview API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Import routes
from routes import users, jobs, stripe_routes, extraction, templates

# Include routers
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(stripe_routes.router, prefix="/api/stripe", tags=["stripe"])
app.include_router(extraction.router, prefix="/api/extraction", tags=["extraction"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])

# GCS lifecycle policies handle automatic cleanup

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)