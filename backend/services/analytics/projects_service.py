"""CRUD service for Project rows (firm-scoped)."""

from __future__ import annotations

import uuid
from typing import List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.db_models import Project


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


def create_project(db: Session, firm_id, *, payload) -> Project:
    project = Project(
        id=uuid.uuid4(),
        firm_id=firm_id,
        client_id=payload.client_id,
        name=payload.name,
        status=payload.status or "active",
        description=payload.description,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, firm_id, project_id: str, *, payload) -> Project:
    project = get_project(db, firm_id, project_id)
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(project, k, v)
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, firm_id, project_id: str) -> None:
    project = get_project(db, firm_id, project_id)
    db.delete(project)
    db.commit()
