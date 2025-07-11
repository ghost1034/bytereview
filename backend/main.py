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

# Initialize FastAPI app
app = FastAPI(title="FinancialExtract API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
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
    return {"message": "FinancialExtract API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Import routes
from routes import users, stripe_routes, extraction, templates

# Include routers
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(stripe_routes.router, prefix="/api/stripe", tags=["stripe"])
app.include_router(extraction.router, prefix="/api/extraction", tags=["extraction"])
app.include_router(templates.router, prefix="/api/templates", tags=["templates"])

# GCS lifecycle policies handle automatic cleanup

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)