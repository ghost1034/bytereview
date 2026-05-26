"""CRUD routes for analytics clients."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import get_current_user_id
from models.analytics import (
    ClientCreateRequest,
    ClientListResponse,
    ClientResponse,
    ClientUpdateRequest,
)
from services.analytics import clients_service
from services.analytics.firm_scope import require_firm_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics/clients", tags=["analytics-clients"])


def _to_response(c) -> ClientResponse:
    return ClientResponse(
        id=str(c.id),
        firm_id=str(c.firm_id),
        name=c.name,
        industry=c.industry,
        contact_name=c.contact_name,
        contact_email=c.contact_email,
        contact_phone=c.contact_phone,
        fiscal_year_end=c.fiscal_year_end,
        notes=c.notes,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("", response_model=ClientListResponse)
async def list_clients_route(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    return ClientListResponse(
        clients=[_to_response(c) for c in clients_service.list_clients(db, firm_id)]
    )


@router.post("", response_model=ClientResponse)
async def create_client_route(
    payload: ClientCreateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    client = clients_service.create_client(db, firm_id, payload=payload)
    return _to_response(client)


@router.get("/{client_id}", response_model=ClientResponse)
async def get_client_route(
    client_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    return _to_response(clients_service.get_client(db, firm_id, client_id))


@router.put("/{client_id}", response_model=ClientResponse)
async def update_client_route(
    client_id: str,
    payload: ClientUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    return _to_response(clients_service.update_client(db, firm_id, client_id, payload=payload))


@router.delete("/{client_id}")
async def delete_client_route(
    client_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    firm_id = require_firm_id(db, user_id)
    clients_service.delete_client(db, firm_id, client_id)
    return {"success": True}
