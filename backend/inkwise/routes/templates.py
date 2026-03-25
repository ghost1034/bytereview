import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import verify_firebase_token
from inkwise.schemas import (
    InkwisePaginatedTemplates,
    InkwiseSystemTemplateCategoryListResponse,
    InkwiseSystemTemplateListResponse,
    InkwiseSystemTemplateOut,
    InkwiseTemplateCreateRequest,
    InkwiseTemplateOut,
    InkwiseTemplateUpdateRequest,
)
from inkwise.services.source_service import InkwiseSourceService
from inkwise.services.template_service import InkwiseTemplateService
from services.user_service import DuplicatePhoneNumberError

router = APIRouter(tags=["inkwise-templates"])
template_service = InkwiseTemplateService()
user_support = InkwiseSourceService()


@router.get("/templates", response_model=InkwisePaginatedTemplates)
def list_templates(
    page: int = 1,
    limit: int = 20,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwisePaginatedTemplates:
    try:
        items, total = template_service.list_templates(db, user_id=token_data["uid"], page=page, limit=limit)
        return InkwisePaginatedTemplates(
            items=[InkwiseTemplateOut.model_validate(item) for item in items],
            page=page,
            limit=limit,
            total=total,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/templates", response_model=InkwiseTemplateOut, status_code=201)
def create_template(
    body: InkwiseTemplateCreateRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseTemplateOut:
    try:
        user_support.ensure_user_record(
            db,
            user_id=token_data["uid"],
            email=token_data.get("email"),
            phone_number=token_data.get("phone_number"),
        )
        template = template_service.create_template(db, user_id=token_data["uid"], body=body)
        return InkwiseTemplateOut.model_validate(template)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DuplicatePhoneNumberError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create template: {exc}") from exc


@router.get("/templates/{template_id}", response_model=InkwiseTemplateOut)
def get_template(
    template_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseTemplateOut:
    try:
        template = template_service.get_template_or_404(db, user_id=token_data["uid"], template_id=template_id)
        return InkwiseTemplateOut.model_validate(template)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/templates/{template_id}", response_model=InkwiseTemplateOut)
def update_template(
    template_id: uuid.UUID,
    body: InkwiseTemplateUpdateRequest,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseTemplateOut:
    try:
        template = template_service.update_template(
            db,
            user_id=token_data["uid"],
            template_id=template_id,
            body=body,
        )
        return InkwiseTemplateOut.model_validate(template)
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update template: {exc}") from exc


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> dict:
    try:
        template_service.delete_template(db, user_id=token_data["uid"], template_id=template_id)
        return {"message": "Template deleted successfully"}
    except FileNotFoundError as exc:
        db.rollback()
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete template: {exc}") from exc


@router.get("/system-template-categories", response_model=InkwiseSystemTemplateCategoryListResponse)
def list_system_template_categories(
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseSystemTemplateCategoryListResponse:
    _ = token_data
    items = template_service.list_system_template_categories(db)
    return InkwiseSystemTemplateCategoryListResponse(items=items)


@router.get("/system-templates", response_model=InkwiseSystemTemplateListResponse)
def list_system_templates(
    category_id: int | None = None,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseSystemTemplateListResponse:
    _ = token_data
    items = template_service.list_system_templates(db, category_id=category_id)
    return InkwiseSystemTemplateListResponse(items=items)


@router.get("/system-templates/{system_template_id}", response_model=InkwiseSystemTemplateOut)
def get_system_template(
    system_template_id: uuid.UUID,
    token_data: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> InkwiseSystemTemplateOut:
    _ = token_data
    try:
        template = template_service.get_system_template_or_404(db, system_template_id=system_template_id)
        return InkwiseSystemTemplateOut.model_validate(template)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
