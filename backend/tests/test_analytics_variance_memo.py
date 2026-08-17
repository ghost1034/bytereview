from __future__ import annotations

import os
import sys
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("ENVIRONMENT", "test")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from models.analytics import VarianceMemoRequest
from routes import analytics_variance
from services import analytics_ai_service


DATA = [
    {
        "accountName": "1000 Cash",
        "accountType": "Asset",
        "department": "Corporate",
        "baseAmount": 100.0,
        "compAmount": 120.0,
        "variance": 20.0,
        "variancePercent": 20.0,
        "description": "Bank activity increased.",
        "explanation": "Bank activity increased by the supported variance.",
        "isFlagged": True,
    }
]

CONFIG = {
    "thresholdDollar": 10.0,
    "thresholdPercent": 5.0,
    "logic": "Either",
    "basePeriodStart": "2026-01-01",
    "basePeriodEnd": "2026-01-31",
    "compPeriodStart": "2026-02-01",
    "compPeriodEnd": "2026-02-28",
}


@pytest.mark.asyncio
async def test_variance_memo_supplies_authoritative_context_and_adds_draft_header(monkeypatch):
    captured = {}

    class Models:
        async def generate_content(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                text=(
                    "## EXECUTIVE SUMMARY\nThe variance was $20.00 (20%).\n\n"
                    "## MATERIALITY & METHODOLOGY\nThresholds were $10 and 5%.\n\n"
                    "## MATERIAL VARIANCE DETAIL\n### 1000 Cash\n"
                    "Base was $100 and comparison was $120.\n\n"
                    "## CONCLUSION & RECOMMENDATIONS\nReviewer follow-up is required."
                )
            )

    monkeypatch.setattr(
        analytics_ai_service,
        "get_client",
        lambda: SimpleNamespace(aio=SimpleNamespace(models=Models())),
    )

    text, _usage = await analytics_ai_service.variance_memo(
        DATA,
        CONFIG,
        analysis_name="February Flux",
        client_name="Example Co",
        as_of_date="2026-03-01",
    )

    prompt = captured["contents"]
    assert "Client: Example Co" in prompt
    assert "Analysis: February Flux" in prompt
    assert "Base period: 2026-01-01 through 2026-01-31" in prompt
    assert "Comparison period: 2026-02-01 through 2026-02-28" in prompt
    assert "As-of / generation date: 2026-03-01" in prompt
    assert "Never infer or invent dates" in prompt
    assert "**Status:** Draft — reviewer approval required" in text
    assert "**Client:** Example Co" in text


@pytest.mark.asyncio
async def test_variance_memo_rejects_unsupported_generated_facts(monkeypatch):
    class Models:
        async def generate_content(self, **_kwargs):
            return SimpleNamespace(
                text=(
                    "## MATERIAL VARIANCE DETAIL\n### 9999 Invented Revenue\n"
                    "A 2023-12-31 acquisition caused a $999 increase of 88%, continuing in 2024."
                )
            )

    monkeypatch.setattr(
        analytics_ai_service,
        "get_client",
        lambda: SimpleNamespace(aio=SimpleNamespace(models=Models())),
    )

    with pytest.raises(analytics_ai_service.VarianceMemoValidationError) as exc_info:
        await analytics_ai_service.variance_memo(
            DATA,
            CONFIG,
            analysis_name="February Flux",
            client_name="Example Co",
            as_of_date="2026-03-01",
        )

    unsupported = exc_info.value.unsupported_facts
    assert "unsupported date: 2023-12-31" in unsupported
    assert "unsupported date: 2024" in unsupported
    assert "unsupported account: 9999 Invented Revenue" in unsupported
    assert "unsupported amount: $999" in unsupported
    assert "unsupported percentage: 88%" in unsupported


def test_variance_memo_accepts_supported_month_year_labels():
    flagged_details = [
        {
            "account": "1000 Cash",
            "base": 100.0,
            "comp": 120.0,
            "variance": 20.0,
            "variancePercent": 20.0,
        }
    ]

    analytics_ai_service._validate_variance_memo(
        "### 1000 Cash\nActivity increased by $20.00 (20%) in February 2026.",
        flagged_details,
        CONFIG,
        "2026-03-01",
    )


def test_variance_memo_rejects_unsupported_month_year_labels():
    flagged_details = [
        {
            "account": "1000 Cash",
            "base": 100.0,
            "comp": 120.0,
            "variance": 20.0,
            "variancePercent": 20.0,
        }
    ]

    with pytest.raises(analytics_ai_service.VarianceMemoValidationError) as exc_info:
        analytics_ai_service._validate_variance_memo(
            "### 1000 Cash\nActivity increased by $20.00 (20%) in February 2025.",
            flagged_details,
            CONFIG,
            "2026-03-01",
        )

    assert "unsupported date: February 2025" in exc_info.value.unsupported_facts


@pytest.mark.asyncio
async def test_variance_memo_route_uses_firm_scoped_persisted_analysis(monkeypatch):
    captured = {}
    row = SimpleNamespace(
        type="variance",
        name="Persisted Analysis",
        client=SimpleNamespace(name="Persisted Client"),
        config=CONFIG,
        data={"processed": DATA},
    )

    monkeypatch.setattr(analytics_variance, "require_firm_id", lambda *_args: "firm-1")
    monkeypatch.setattr(
        analytics_variance.analyses_service,
        "get_analysis",
        lambda _db, firm_id, analysis_id: (
            captured.update(firm_id=firm_id, analysis_id=analysis_id) or row
        ),
    )
    monkeypatch.setattr(analytics_variance, "preflight_check", lambda *_args: None)
    monkeypatch.setattr(analytics_variance, "record_call", lambda *_args: None)

    async def fake_variance_memo(data, config, **context):
        captured.update(data=data, config=config, context=context)
        return "validated memo", {
            "prompt_tokens": 1,
            "output_tokens": 1,
            "total_tokens": 2,
        }

    monkeypatch.setattr(analytics_variance.analytics_ai_service, "variance_memo", fake_variance_memo)

    response = await analytics_variance.generate_memo(
        VarianceMemoRequest(analysisId="analysis-1"),
        actor=SimpleNamespace(id="user-1"),
        db=SimpleNamespace(),
    )

    assert captured["firm_id"] == "firm-1"
    assert captured["analysis_id"] == "analysis-1"
    assert captured["data"] == DATA
    assert captured["config"] == CONFIG
    assert captured["context"] == {
        "analysis_name": "Persisted Analysis",
        "client_name": "Persisted Client",
    }
    assert response.text == "validated memo"
