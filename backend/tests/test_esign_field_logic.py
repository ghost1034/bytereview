import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.esign.field_logic import (
    FieldLogicError,
    condition_matches,
    evaluate_formula,
    resolve_visibility,
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
