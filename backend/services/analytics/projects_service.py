"""CRUD service for Project rows (firm-scoped)."""

from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from dependencies.analytics_rbac import assert_project_transition
from models.db_models import (
    AnalyticsProjectModule,
    AnalyticsProjectStatus,
    Project,
    User,
)


def list_projects(db: Session, firm_id) -> List[Project]:
    return (
        db.query(Project)
        .filter(Project.firm_id == firm_id)
        .order_by(Project.created_at.desc())
        .all()
    )


def get_project(db: Session, firm_id, project_id: str) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.firm_id == firm_id)
        .first()
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _validate_assignee(db: Session, firm_id, assigned_to_user_id: Optional[str]) -> None:
    if not assigned_to_user_id:
        return
    user = (
        db.query(User)
        .filter(User.id == assigned_to_user_id, User.firm_id == firm_id)
        .first()
    )
    if user is None:
        raise HTTPException(
            status_code=422,
            detail="Assigned user is not a member of this firm",
        )


def create_project(db: Session, firm_id, *, payload) -> Project:
    _validate_assignee(db, firm_id, payload.assigned_to_user_id)
    project = Project(
        id=uuid.uuid4(),
        firm_id=firm_id,
        client_id=payload.client_id,
        assigned_to_user_id=payload.assigned_to_user_id,
        name=payload.name,
        status=AnalyticsProjectStatus(payload.status) if payload.status else AnalyticsProjectStatus.DRAFT,
        module=AnalyticsProjectModule(payload.module) if payload.module else AnalyticsProjectModule.OTHER,
        due_date=payload.due_date,
        description=payload.description,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, firm_id, project_id: str, *, payload, actor: User) -> Project:
    project = get_project(db, firm_id, project_id)
    data = payload.model_dump(exclude_unset=True)

    if "assigned_to_user_id" in data:
        _validate_assignee(db, firm_id, data["assigned_to_user_id"])

    if "status" in data:
        assert_project_transition(actor, project.status, data["status"])

    for k, v in data.items():
        if k == "status" and v is not None:
            setattr(project, k, AnalyticsProjectStatus(v))
        elif k == "module" and v is not None:
            setattr(project, k, AnalyticsProjectModule(v))
        else:
            setattr(project, k, v)
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, firm_id, project_id: str) -> None:
    project = get_project(db, firm_id, project_id)
    db.delete(project)
    db.commit()
