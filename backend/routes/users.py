"""
User management routes for ByteReview
PostgreSQL-only implementation
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from services.user_service import UserService
from models.user import UserResponse, UserUpdate, UpdateProfileRequest
# Usage tracking imports will be added when billing is implemented
from dependencies.auth import verify_firebase_token, get_current_user_id

router = APIRouter()
user_service = UserService()

@router.get("/me", response_model=UserResponse)
async def get_current_user(token_data: dict = Depends(verify_firebase_token)):
    """Get current user information - returns existing user or creates minimal profile"""
    try:
        # Just get or create user with minimal data from token
        # Frontend will call /me/sync with complete profile data
        user = await user_service.get_or_create_user(
            uid=token_data["uid"],
            email=token_data.get("email"),
            display_name=None,  # Will be updated via /me/sync
            photo_url=None
        )
        return user
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting user: {str(e)}")

from pydantic import BaseModel

class UserSyncRequest(BaseModel):
    display_name: Optional[str] = None
    photo_url: Optional[str] = None

@router.post("/me/sync", response_model=UserResponse)
async def sync_user_profile(
    sync_data: UserSyncRequest,
    token_data: dict = Depends(verify_firebase_token)
):
    """
    Sync user profile with data from frontend
    Frontend sends complete user profile data
    """
    try:
        user = await user_service.sync_user_profile(
            uid=token_data["uid"],
            email=token_data.get("email"),
            display_name=sync_data.display_name,
            photo_url=sync_data.photo_url
        )
        return user
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error syncing user: {str(e)}")

@router.put("/me", response_model=UserResponse)
async def update_current_user(
    profile_update: UpdateProfileRequest,
    token_data: dict = Depends(verify_firebase_token)
):
    """Update current user's profile"""
    try:
        user_update = UserUpdate(display_name=profile_update.display_name)
        user = await user_service.update_user(token_data["uid"], user_update)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating user: {str(e)}")

# Usage tracking endpoints will be added when Stripe billing is implemented

# Migration endpoint removed - no longer needed since we're PostgreSQL-only