import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.esign.field_logic import (
    FieldLogicError,
    condition_matches,
    evaluate_formula,
    compute_formulas,
    resolve_visibility,
    synchronize_shared_values,
    validate_field_value,
    validate_field_graph,
)


VECTORS = json.loads((Path(__file__).parent / "fixtures" / "field_logic_vectors.json").read_text())


def test_shared_formula_vectors():
    for vector in VECTORS["formulas"]:
        assert evaluate_formula(vector["expression"], vector["values"], vector["places"]) == vector["expected"]


def test_shared_condition_vectors():
    parent = {"id": "parent", "field_type": "text", "properties": {}}
    for vector in VECTORS["conditions"]:
        rule = {"operator": vector["operator"], "values": vector["values"]}
        assert condition_matches(rule, parent, [parent], {"parent": vector["current"]}) is vector["expected"]


def test_transitive_visibility_and_cycle_rejection():
    fields = [
        {"id": "a", "field_type": "text", "properties": {}},
        {"id": "b", "field_type": "text", "properties": {"conditional": {"parent_field_id": "a", "operator": "equals", "values": ["yes"], "action": "show"}}},
        {"id": "c", "field_type": "text", "properties": {"conditional": {"parent_field_id": "b", "operator": "not_empty", "values": [], "action": "show"}}},
    ]
    validate_field_graph(fields)
    assert resolve_visibility(fields, {"a": "no", "b": "value"}) == {"a": True, "b": False, "c": False}
    fields[0]["properties"] = {"conditional": {"parent_field_id": "c", "operator": "not_empty", "values": [], "action": "show"}}
    with pytest.raises(FieldLogicError, match="cycle"):
        validate_field_graph(fields)


def test_stable_label_formula_functions_and_dates():
    assert evaluate_formula("IF([subtotal] >= 10, ROUND([subtotal] * 1.25, 1), 0)", {"subtotal": "12"}, 2) == "15.00"
    assert evaluate_formula("SUM([a], [b], 3) + MAX(1, 2)", {"a": "2", "b": "4"}, 0) == "11"
    assert evaluate_formula("DATEDIFF([start], DATEADD([start], 5, 'days'))", {"start": "2026-07-01"}, 0) == "5"
    fields = [
        {"id": "a", "recipient_id": "r1", "field_type": "number", "properties": {"data_label": "subtotal"}},
        {"id": "f", "recipient_id": "r1", "field_type": "formula", "properties": {"formula": {"expression": "[subtotal] * 2", "decimal_places": 0}}},
    ]
    validate_field_graph(fields)
    assert compute_formulas(fields, {"a": "7"}) == {"f": "14"}


def test_same_recipient_dependencies_shared_values_and_validation():
    cross_recipient = [
        {"id": "a", "recipient_id": "r1", "field_type": "number", "properties": {"data_label": "amount"}},
        {"id": "f", "recipient_id": "r2", "field_type": "formula", "properties": {"formula": {"expression": "[amount]", "decimal_places": 0}}},
    ]
    with pytest.raises(FieldLogicError, match="same recipient"):
        validate_field_graph(cross_recipient)
    shared = [
        {"id": "a", "recipient_id": "r1", "field_type": "text", "properties": {"data_label": "account", "shared_value": True}},
        {"id": "b", "recipient_id": "r1", "field_type": "text", "properties": {"data_label": "account", "shared_value": True}},
        {"id": "c", "recipient_id": "r2", "field_type": "text", "properties": {"data_label": "account", "shared_value": True}},
    ]
    assert synchronize_shared_values(shared, {"a": "123"}) == {"a": "123", "b": "123"}
    number = {"field_type": "number", "label": "Amount", "properties": {"number_validation": {"minimum": 1, "maximum": 10, "decimal_places": 2}}}
    assert validate_field_value(number, "4.25") == "4.25"
    with pytest.raises(FieldLogicError, match="maximum"):
        validate_field_value(number, "11")
