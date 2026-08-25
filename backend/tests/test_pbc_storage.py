from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException

from services import pbc_storage


def test_pbc_storage_plan_allowances_use_binary_units():
    assert pbc_storage.PBC_STORAGE_LIMITS == {
        "free": 20 * 1024 * 1024,
        "basic": 100 * 1024 * 1024,
        "pro": 1024 * 1024 * 1024,
    }


def test_storage_capacity_accepts_an_upload_that_exactly_fits(monkeypatch):
    summary = {
        "plan_code": "free",
        "used_bytes": 15,
        "reserved_bytes": 0,
        "included_bytes": 20,
        "remaining_bytes": 5,
    }
    monkeypatch.setattr(pbc_storage, "pbc_storage_summary", lambda *_args, **_kwargs: summary)

    assert pbc_storage.require_pbc_storage(object(), uuid.uuid4(), 5) == summary


def test_storage_capacity_returns_structured_upgrade_error(monkeypatch):
    summary = {
        "plan_code": "basic",
        "used_bytes": 95,
        "reserved_bytes": 4,
        "included_bytes": 100,
        "remaining_bytes": 1,
    }
    monkeypatch.setattr(pbc_storage, "pbc_storage_summary", lambda *_args, **_kwargs: summary)

    with pytest.raises(HTTPException) as exceeded:
        pbc_storage.require_pbc_storage(object(), uuid.uuid4(), 2)

    assert exceeded.value.status_code == 402
    assert exceeded.value.detail == {
        "code": "pbc_storage_limit_exceeded",
        "message": "This upload exceeds the firm's PBC storage allowance. Upgrade the plan or reduce the file size.",
        **summary,
        "requested_bytes": 2,
    }
