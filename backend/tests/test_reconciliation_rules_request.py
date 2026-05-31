"""Regression tests for reconciliation rule-generation request validation."""

from models.analytics import (
    ReconciliationAdditionalPassRequest,
    ReconciliationRulesGenerateRequest,
)


def test_generate_rules_accepts_available_rules_array():
    payload = {
        "headers": ["Date", "Description", "Amount"],
        "availableRules": [
            {"category": "Date", "rules": ["Date - Exact", "Date - Range"]},
            {"category": "Amount", "rules": ["Amount - Exact Match"]},
        ],
    }
    req = ReconciliationRulesGenerateRequest.model_validate(payload)
    assert isinstance(req.available_rules, list)
    assert req.available_rules[0]["category"] == "Date"


def test_generate_rules_accepts_available_rules_dict():
    payload = {
        "headers": ["Date"],
        "availableRules": {"Date": ["Date - Exact"]},
    }
    req = ReconciliationRulesGenerateRequest.model_validate(payload)
    assert isinstance(req.available_rules, dict)


def test_additional_pass_accepts_available_rules_array():
    payload = {
        "instructions": "Add a near match pass",
        "availableRules": [
            {"category": "Amount", "rules": ["Amount - Exact Match"]},
        ],
    }
    req = ReconciliationAdditionalPassRequest.model_validate(payload)
    assert isinstance(req.available_rules, list)
