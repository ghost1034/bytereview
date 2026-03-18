from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class UserCreate(BaseModel):
    uid: str
    email: EmailStr
    phone_number: Optional[str] = None
    phone_verified_at: Optional[datetime] = None
    display_name: Optional[str] = None
    photo_url: Optional[str] = None

class UserUpdate(BaseModel):
    phone_number: Optional[str] = None
    phone_verified_at: Optional[datetime] = None
    display_name: Optional[str] = None
    photo_url: Optional[str] = None

class UserResponse(BaseModel):
    uid: str
    email: str
    phone_number: Optional[str] = None
    phone_verified_at: Optional[datetime] = None
    display_name: Optional[str] = None
    photo_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Stripe and usage fields will be added when billing is implemented  # Free tier limit

class UserInDB(UserResponse):
    pass

class UpdateProfileRequest(BaseModel):
    display_name: Optional[str] = None
