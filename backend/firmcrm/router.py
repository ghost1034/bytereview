from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from dependencies.auth import verify_firebase_token
from firmcrm.api.router import api_router
from services.billing_service import get_billing_service
from services.paid_product_access import require_pro_plan


def require_pro_firmcrm_user(
    token: dict = Depends(verify_firebase_token),
    db: Session = Depends(get_db),
) -> dict:
    require_pro_plan(
        db,
        token["uid"],
        product_code="firmcrm",
        product_name="FirmCRM",
        billing_service_factory=get_billing_service,
    )
    return token

router = APIRouter(
    prefix='/api/firmcrm',
    tags=['firmcrm'],
    dependencies=[Depends(require_pro_firmcrm_user)],
)
router.include_router(api_router)
