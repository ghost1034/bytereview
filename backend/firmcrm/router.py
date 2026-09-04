from fastapi import APIRouter
from firmcrm.api.router import api_router

router = APIRouter(prefix='/api/firmcrm', tags=['firmcrm'])
router.include_router(api_router)
