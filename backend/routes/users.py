"""
User management routes - handles all user CRUD operations
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from services.user_service import UserService
from models.user import UserResponse, UserUpdate, UpdateProfileRequest
from models.common import UsageStats
from dependencies.auth import verify_firebase_token, get_current_user_id

router = APIRouter()
user_service = UserService()

@router.get("/me", response_model=UserResponse)
async def get_current_user(token_data: dict = Depends(verify_firebase_token)):
    """Get current user information and create if doesn't exist"""
    try:
        # Get or create user in Firestore
        user = await user_service.get_or_create_user(
            uid=token_data["uid"],
            email=token_data.get("email"),
            display_name=token_data.get("name"),
            photo_url=token_data.get("picture")
        )
        return user
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting user: {str(e)}")

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

@router.get("/usage", response_model=UsageStats)
async def get_user_usage(user_id: str = Depends(get_current_user_id)):
    """Get user's usage statistics"""
    try:
        user = await user_service.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        return UsageStats(
            pages_used=user.pages_used,
            pages_limit=user.pages_limit,
            subscription_status=user.subscription_status,
            usage_percentage=(user.pages_used / user.pages_limit) * 100 if user.pages_limit > 0 else 0
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting usage: {str(e)}")