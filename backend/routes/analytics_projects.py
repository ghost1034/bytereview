"""CRUD routes for analytics projects."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.analytics_rbac import READER_ROLES, WRITER_ROLES, require_role
from models.analytics import (
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdateRequest,
)
from models.db_models import User
from services.analytics import projects_service
from services.analytics.firm_scope import require_firm_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/projects", tags=["analytics-projects"])


def _to_response(p) -> ProjectResponse:
    return ProjectResponse(
        id=str(p.id),
        firm_id=str(p.firm_id),
        client_id=str(p.client_id) if p.client_id else None,
        assigned_to_user_id=p.assigned_to_user_id,
        name=p.name,
        status=p.status.value if hasattr(p.status, "value") else p.status,
        module=p.module.value if hasattr(p.module, "value") else p.module,
        due_date=p.due_date,
        description=p.description,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.get("", response_model=ProjectListResponse)
async def list_projects_route(
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    return ProjectListResponse(
        projects=[_to_response(p) for p in projects_service.list_projects(db, firm_id)]
    )


@router.post("", response_model=ProjectResponse)
async def create_project_route(
    payload: ProjectCreateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    project = projects_service.create_project(db, firm_id, payload=payload)
    return _to_response(project)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project_route(
    project_id: str,
    actor: User = Depends(require_role(*READER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    return _to_response(projects_service.get_project(db, firm_id, project_id))


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project_route(
    project_id: str,
    payload: ProjectUpdateRequest,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    return _to_response(
        projects_service.update_project(
            db, firm_id, project_id, payload=payload, actor=actor
        )
    )


@router.delete("/{project_id}")
async def delete_project_route(
    project_id: str,
    actor: User = Depends(require_role(*WRITER_ROLES)),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, actor.id)
    projects_service.delete_project(db, firm_id, project_id)
    return {"success": True}
