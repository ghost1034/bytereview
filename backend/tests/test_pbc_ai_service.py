from __future__ import annotations

import os
import sys
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from services import pbc_ai_service
from services.pbc_ai_service import _draft_response_schema


def test_draft_response_schema_requires_complete_bounded_proposals():
    schema = _draft_response_schema()

    assert schema.required == ["summary", "proposals"]
    proposals = schema.properties["proposals"]
    assert proposals.items.required == [
        "title",
        "category",
        "description",
        "priority",
        "expected_formats",
        "rationale",
    ]
    assert proposals.items.properties["priority"].enum == ["low", "normal", "high", "urgent"]


@pytest.mark.asyncio
async def test_draft_request_list_uses_requested_model_minimal_thinking_and_no_output_cap(monkeypatch):
    captured = {}

    class Query:
        def filter(self, *_args):
            return self

        def limit(self, _value):
            return self

        def all(self):
            return []

    class Models:
        async def generate_content(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                text='{"summary":"Ready for review","proposals":['
                '{"title":"Trial balance","category":"General ledger",'
                '"description":"Provide the final trial balance.","priority":"high",'
                '"expected_formats":["xlsx"],"rationale":"Supports audit planning."}]}'
            )

    client = SimpleNamespace(aio=SimpleNamespace(models=Models()))
    monkeypatch.setattr(pbc_ai_service, "get_client", lambda: client)
    monkeypatch.setattr(pbc_ai_service, "_meter", lambda *_args: None)

    engagement = SimpleNamespace(
        id="engagement-1",
        firm_id="firm-1",
        name="Annual audit",
        client_name_snapshot="Example Co",
        engagement_type="audit",
        period_start=None,
        period_end=None,
        due_date=None,
    )
    result = await pbc_ai_service.draft_request_list(
        SimpleNamespace(query=lambda *_args: Query()),
        "user-1",
        engagement,
        None,
    )

    config = captured["config"]
    assert captured["model"] == "gemini-3.6-flash"
    assert config.response_schema.required == ["summary", "proposals"]
    assert config.thinking_config.thinking_level == "MINIMAL"
    assert config.max_output_tokens is None
    assert result["proposals"][0]["title"] == "Trial balance"


@pytest.mark.asyncio
async def test_match_document_uses_requested_model_minimal_thinking_and_no_output_cap(monkeypatch):
    captured = {}

    class Query:
        def filter(self, *_args):
            return self

        def order_by(self, *_args):
            return self

        def all(self):
            return []

    class Models:
        async def generate_content(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(text='{"candidates":[],"warnings":[]}')

    client = SimpleNamespace(aio=SimpleNamespace(models=Models()))
    monkeypatch.setattr(pbc_ai_service, "get_client", lambda: client)
    monkeypatch.setattr(pbc_ai_service, "_meter", lambda *_args: None)

    document = SimpleNamespace(
        id="document-1",
        filename="trial-balance.xlsx",
        mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size_bytes=1024,
        ai_metadata=None,
    )
    result = await pbc_ai_service.match_document(
        SimpleNamespace(query=lambda *_args: Query()),
        "user-1",
        SimpleNamespace(id="engagement-1"),
        document,
    )

    config = captured["config"]
    assert captured["model"] == "gemini-3.6-flash"
    assert config.thinking_config.thinking_level == "MINIMAL"
    assert config.max_output_tokens is None
    assert result["model"] == "gemini-3.6-flash"
