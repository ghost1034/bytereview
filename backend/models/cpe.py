"""
Pydantic models for CPE Tracker endpoints
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class CpeStateResponse(BaseModel):
    """A CPE state template (e.g., California)"""
    template_id: str
    name: str


class CpeStatesListResponse(BaseModel):
    """List of available CPE state templates"""
    states: List[CpeStateResponse]


class CpeSheetListItem(BaseModel):
    """Summary of a CPE sheet for list display"""
    job_id: str
    name: str
    state_name: Optional[str] = None
    status: str
    config_step: str
    created_at: datetime
    latest_run_id: Optional[str] = None


class CpeSheetsListResponse(BaseModel):
    """List of user's CPE sheets"""
    sheets: List[CpeSheetListItem]
    total: int


class CreateCpeSheetRequest(BaseModel):
    """Request to create a new CPE sheet"""
    template_id: str
    name: Optional[str] = None


class CreateCpeSheetResponse(BaseModel):
    """Response after creating a CPE sheet"""
    job_id: str
    run_id: str
    message: str


class StartCpeSheetResponse(BaseModel):
    """Response after starting CPE sheet processing"""
    active_run_id: str
    message: str
