from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from models.db_models import AnalyticsUserRole
from routes.admin import require_system_admin


def _db_returning(user):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = user
    return db


@pytest.mark.asyncio
async def test_firm_admin_cannot_access_system_admin_console():
    firm_admin = SimpleNamespace(
        id="firm-admin",
        role=AnalyticsUserRole.ADMIN,
        is_system_admin=False,
    )

    with pytest.raises(HTTPException) as error:
        await require_system_admin(user_id=firm_admin.id, db=_db_returning(firm_admin))

    assert error.value.status_code == 403
    assert error.value.detail == "System administrator access required"


@pytest.mark.asyncio
async def test_system_admin_can_access_console_regardless_of_firm_role():
    system_admin = SimpleNamespace(
        id="system-admin",
        role=AnalyticsUserRole.ANALYST,
        is_system_admin=True,
    )

    result = await require_system_admin(
        user_id=system_admin.id,
        db=_db_returning(system_admin),
    )

    assert result is system_admin


@pytest.mark.asyncio
async def test_missing_user_cannot_access_system_admin_console():
    with pytest.raises(HTTPException) as error:
        await require_system_admin(user_id="missing", db=_db_returning(None))

    assert error.value.status_code == 403
