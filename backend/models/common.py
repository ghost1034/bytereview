"""
Common data models and types used across the application
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class BaseResponse(BaseModel):
    """Base response model for all API responses"""
    success: bool
    message: Optional[str] = None
    error: Optional[str] = None

class PaginationParams(BaseModel):
    """Standard pagination parameters"""
    page: int = Field(default=1, ge=1, description="Page number (1-based)")
    limit: int = Field(default=25, ge=1, le=100, description="Items per page")

class PaginatedResponse(BaseResponse):
    """Base paginated response"""
    total: int
    page: int
    limit: int
    total_pages: int

class FileMetadata(BaseModel):
    """File metadata information"""
    filename: str
    size_bytes: int
    content_type: Optional[str] = None
    upload_time: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None

class UsageStats(BaseModel):
    """User usage statistics"""
    pages_used: int
    pages_limit: int
    subscription_status: str
    usage_percentage: float

class DataTypeResponse(BaseModel):
    """Data type response model"""
    id: str
    display_name: str
    description: str
    base_json_type: str
    json_format: Optional[str] = None
    display_order: int