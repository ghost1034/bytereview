from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
import os
from typing import Optional

router = APIRouter()
security = HTTPBearer()

# Initialize Firebase Admin SDK
if not firebase_admin._apps:
    # In production, use service account key
    # For development, you can use the default credentials
    try:
        cred = credentials.Certificate(os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH"))
        firebase_admin.initialize_app(cred)
    except:
        # Fallback to default credentials
        firebase_admin.initialize_app()

class UserResponse(BaseModel):
    uid: str
    email: Optional[str]
    display_name: Optional[str]

async def verify_firebase_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Verify Firebase ID token"""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    try:
        # Verify the ID token
        decoded_token = firebase_auth.verify_id_token(credentials.credentials)
        return decoded_token
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

@router.get("/me", response_model=UserResponse)
async def get_current_user(token_data: dict = Depends(verify_firebase_token)):
    """Get current user information"""
    return UserResponse(
        uid=token_data["uid"],
        email=token_data.get("email"),
        display_name=token_data.get("name")
    )

@router.post("/verify-token")
async def verify_token(token_data: dict = Depends(verify_firebase_token)):
    """Verify if token is valid"""
    return {"valid": True, "uid": token_data["uid"]}