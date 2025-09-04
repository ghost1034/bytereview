"""
Pydantic models for automation API requests and responses
"""
from pydantic import BaseModel, Field, validator
from typing import Optional, Dict, Any, List
from datetime import datetime
from uuid import UUID

class AutomationCreate(BaseModel):
    """Request model for creating an automation"""
    name: str = Field(..., description="Human-readable name for the automation")
    is_enabled: bool = Field(default=True, description="Whether the automation is enabled")
    trigger_type: str = Field(..., description="Type of trigger (gmail_attachment for v1)")
    trigger_config: Dict[str, Any] = Field(..., description="Configuration for the trigger")
    job_id: UUID = Field(..., description="ID of the extraction job to use as template")
    processing_mode: str = Field(default='individual', description="Processing mode (individual or combined)")
    dest_type: Optional[str] = Field(None, description="Export destination type (gdrive, gmail)")
    export_config: Optional[Dict[str, Any]] = Field(None, description="Export configuration")
    
    @validator('trigger_type')
    def validate_trigger_type(cls, v):
        if v not in ['gmail_attachment']:
            raise ValueError('Only gmail_attachment trigger type is supported in v1')
        return v
    
    @validator('processing_mode')
    def validate_processing_mode(cls, v):
        if v not in ['individual', 'combined']:
            raise ValueError('processing_mode must be individual or combined')
        return v
    
    @validator('dest_type')
    def validate_dest_type(cls, v):
        if v is not None and v not in ['gdrive', 'gmail']:
            raise ValueError('dest_type must be gdrive or gmail')
        return v
    
    @validator('export_config')
    def validate_export_config(cls, v, values):
        dest_type = values.get('dest_type')
        # For now, allow dest_type without export_config since users can't configure it yet
        if not dest_type and v:
            raise ValueError('export_config must be NULL when dest_type is NULL')
        return v

class AutomationUpdate(BaseModel):
    """Request model for updating an automation"""
    name: Optional[str] = Field(None, description="Human-readable name for the automation")
    is_enabled: Optional[bool] = Field(None, description="Whether the automation is enabled")
    trigger_config: Optional[Dict[str, Any]] = Field(None, description="Configuration for the trigger")
    processing_mode: Optional[str] = Field(None, description="Processing mode (individual or combined)")
    dest_type: Optional[str] = Field(None, description="Export destination type (gdrive, gmail)")
    export_config: Optional[Dict[str, Any]] = Field(None, description="Export configuration")
    
    @validator('processing_mode')
    def validate_processing_mode(cls, v):
        if v is not None and v not in ['individual', 'combined']:
            raise ValueError('processing_mode must be individual or combined')
        return v
    
    @validator('dest_type')
    def validate_dest_type(cls, v):
        if v is not None and v not in ['gdrive', 'gmail']:
            raise ValueError('dest_type must be gdrive or gmail')
        return v
    
    @validator('export_config')
    def validate_export_config(cls, v, values):
        dest_type = values.get('dest_type')
        # For now, allow dest_type without export_config since users can't configure it yet
        if not dest_type and v:
            raise ValueError('export_config must be NULL when dest_type is NULL')
        return v

class AutomationResponse(BaseModel):
    """Response model for automation data"""
    id: UUID
    user_id: str
    name: str
    is_enabled: bool
    trigger_type: str
    trigger_config: Dict[str, Any]
    job_id: UUID
    processing_mode: str
    dest_type: Optional[str]
    export_config: Optional[Dict[str, Any]]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class AutomationRunResponse(BaseModel):
    """Response model for automation run data"""
    id: UUID
    automation_id: UUID
    job_id: UUID
    status: str
    error_message: Optional[str]
    triggered_at: datetime
    completed_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class AutomationListResponse(BaseModel):
    """Response model for list of automations"""
    automations: List[AutomationResponse]
    total: int

class AutomationRunListResponse(BaseModel):
    """Response model for list of automation runs"""
    runs: List[AutomationRunResponse]
    total: int

class GmailTriggerConfig(BaseModel):
    """Configuration for Gmail attachment trigger"""
    query: str = Field(..., description="Gmail search query to match messages")
    
    @validator('query')
    def validate_query(cls, v):
        if not v or not v.strip():
            raise ValueError('Gmail query cannot be empty')
        return v.strip()

class GoogleDriveExportConfig(BaseModel):
    """Configuration for Google Drive export"""
    folder_id: Optional[str] = Field(None, description="Google Drive folder ID (optional)")

class GmailExportConfig(BaseModel):
    """Configuration for Gmail export"""
    to_email: str = Field(..., description="Email address to send results to")
    
    @validator('to_email')
    def validate_email(cls, v):
        import re
        if not re.match(r'^[^@]+@[^@]+\.[^@]+$', v):
            raise ValueError('Invalid email address')
        return v