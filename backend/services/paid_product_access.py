"""Shared paid-plan authorization for CPAAutomation products."""

from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import verify_firebase_token
from services.billing_service import get_billing_service


def is_paid_plan(plan_code: object) -> bool:
    """Return whether a billing plan grants access to paid platform modules."""

    normalized = str(plan_code or "").strip().lower()
    return bool(normalized and normalized != "free")


def require_paid_plan(
    db: Session,
    user_id: str,
    *,
    product_code: str,
    product_name: str,
    billing_service_factory=get_billing_service,
) -> dict:
    """Load current billing state and fail closed unless it is a paid plan."""

    try:
        billing_info = billing_service_factory(db).get_billing_info(user_id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": f"{product_code}_billing_unavailable",
                "message": f"{product_name} access could not be verified.",
            },
        ) from exc
    if not is_paid_plan(billing_info.get("plan_code")):
        raise HTTPException(
            status_code=403,
            detail={
                "code": f"{product_code}_paid_plan_required",
                "message": f"{product_name} requires a paid plan.",
            },
        )
    return billing_info


def paid_product_dependency(product_code: str, product_name: str) -> Callable:
    """Build a Firebase dependency for a named paid CPAAutomation module."""

    def dependency(
        token: dict = Depends(verify_firebase_token),
        db: Session = Depends(get_db),
    ) -> dict:
        require_paid_plan(
            db,
            token["uid"],
            product_code=product_code,
            product_name=product_name,
        )
        return token

    dependency.__name__ = f"require_paid_{product_code}_user"
    return dependency
