from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    uid: str
    email: EmailStr
    display_name: Optional[str] = None
    photo_url: Optional[str] = None

class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    photo_url: Optional[str] = None

class UserResponse(BaseModel):
    uid: str
    email: str
    display_name: Optional[str] = None
    photo_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    stripe_customer_id: Optional[str] = None
    subscription_status: str = "free"
    pages_used: int = 0
    pages_limit: int = 10  # Free tier limit

class UserInDB(UserResponse):
    pass