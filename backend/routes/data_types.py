"""
Data Types API routes
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import logging

from core.database import get_db
from dependencies.auth import get_current_user_id
from models.db_models import DataType
from models.common import DataTypeResponse

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("", response_model=List[DataTypeResponse])
async def get_data_types(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id)
):
    """Get all available data types"""
    try:
        data_types = db.query(DataType).order_by(DataType.display_order).all()
        
        return [
            DataTypeResponse(
                id=dt.id,
                display_name=dt.display_name,
                description=dt.description,
                base_json_type=dt.base_json_type,
                json_format=dt.json_format,
                display_order=dt.display_order
            )
            for dt in data_types
        ]
    except Exception as e:
        logger.error(f"Failed to get data types: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get data types: {str(e)}")