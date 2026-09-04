from fastapi import APIRouter

from app.api import (
    accounts,
    activities,
    admin,
    auth,
    campaigns,
    conflicts,
    contacts,
    data,
    engagements,
    leads,
    opportunities,
    reference,
    reports,
    users,
    walls,
)

api_router = APIRouter()
for r in (auth, users, reference, accounts, contacts, leads, opportunities, activities, conflicts, engagements, campaigns,
          reports, admin, data, walls):
    api_router.include_router(r.router)
