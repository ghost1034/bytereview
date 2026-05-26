"""CRUD routes for analytics projects."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import get_current_user_id
from models.analytics import (
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdateRequest,
)
from services.analytics import projects_service
from services.analytics.firm_scope import require_firm_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/projects", tags=["analytics-projects"])


def _to_response(p) -> ProjectResponse:
    return ProjectResponse(
        id=str(p.id),
        firm_id=str(p.firm_id),
        client_id=str(p.client_id) if p.client_id else None,
        name=p.name,
        status=p.status,
        description=p.description,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.get("", response_model=ProjectListResponse)
async def list_projects_route(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    return ProjectListResponse(
        projects=[_to_response(p) for p in projects_service.list_projects(db, firm_id)]
    )


@router.post("", response_model=ProjectResponse)
async def create_project_route(
    payload: ProjectCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    project = projects_service.create_project(db, firm_id, payload=payload)
    return _to_response(project)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project_route(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    return _to_response(projects_service.get_project(db, firm_id, project_id))


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project_route(
    project_id: str,
    payload: ProjectUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    return _to_response(projects_service.update_project(db, firm_id, project_id, payload=payload))


@router.delete("/{project_id}")
async def delete_project_route(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    projects_service.delete_project(db, firm_id, project_id)
    return {"success": True}
