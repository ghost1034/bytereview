"""Authoritative validation and evaluation for advanced e-signature fields.

This module deliberately operates on dicts, Pydantic DTOs, and ORM rows.  It
contains no database code, which keeps the rules usable by authoring, signing,
and sealing and makes them straightforward to unit test.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Iterable, Mapping


_REF_RE = re.compile(r"\[([0-9a-fA-F-]{36})\]")
_NUMBER_RE = re.compile(r"(?:\d+(?:\.\d*)?|\.\d+)")


class FieldLogicError(ValueError):
    pass


def _get(field: Any, name: str, default: Any = None) -> Any:
    if isinstance(field, Mapping):
        return field.get(name, default)
    return getattr(field, name, default)


def _type(field: Any) -> str:
    value = _get(field, "field_type", "")
    return value.value if hasattr(value, "value") else str(value)


def _props(field: Any) -> dict[str, Any]:
    value = _get(field, "properties", {})
    return dict(value) if isinstance(value, Mapping) else {}


def formula_references(expression: str) -> list[str]:
    return _REF_RE.findall(expression or "")


class _FormulaParser:
    def __init__(self, expression: str, values: Mapping[str, Any]):
        self.expression = expression or ""
        self.values = values
        self.pos = 0

    def parse(self) -> Decimal:
        result = self._expression()
        self._space()
        if self.pos != len(self.expression):
            raise FieldLogicError(f"Unexpected token at position {self.pos + 1}")
        return result

    def _space(self) -> None:
        while self.pos < len(self.expression) and self.expression[self.pos].isspace():
            self.pos += 1

    def _expression(self) -> Decimal:
        value = self._term()
        while True:
            self._space()
            if self._take("+"):
                value += self._term()
            elif self._take("-"):
                value -= self._term()
            else:
                return value

    def _term(self) -> Decimal:
        value = self._factor()
        while True:
            self._space()
            if self._take("*"):
                value *= self._factor()
            elif self._take("/"):
                divisor = self._factor()
                if divisor == 0:
                    raise FieldLogicError("Division by zero")
                value /= divisor
            else:
                return value

    def _factor(self) -> Decimal:
        self._space()
        if self._take("+"):
            return self._factor()
        if self._take("-"):
            return -self._factor()
        if self._take("("):
            value = self._expression()
            self._space()
            if not self._take(")"):
                raise FieldLogicError("Missing closing parenthesis")
            return value
        if self.pos < len(self.expression) and self.expression[self.pos] == "[":
            end = self.expression.find("]", self.pos + 1)
            if end < 0:
                raise FieldLogicError("Unclosed field reference")
            ref = self.expression[self.pos + 1 : end]
            if not re.fullmatch(r"[0-9a-fA-F-]{36}", ref):
                raise FieldLogicError("Invalid field reference")
            self.pos = end + 1
            raw = self.values.get(ref)
            if raw is None or str(raw).strip() == "":
                raise FieldLogicError(f"Unresolved field reference [{ref}]")
            try:
                return Decimal(str(raw).replace("$", "").replace(",", "").strip())
            except InvalidOperation as exc:
                raise FieldLogicError(f"Field [{ref}] is not numeric") from exc
        match = _NUMBER_RE.match(self.expression, self.pos)
        if match:
            self.pos = match.end()
            return Decimal(match.group(0))
        raise FieldLogicError(f"Expected a number, field, or parenthesis at position {self.pos + 1}")

    def _take(self, token: str) -> bool:
        if self.expression.startswith(token, self.pos):
            self.pos += len(token)
            return True
        return False


def evaluate_formula(expression: str, values: Mapping[str, Any], decimal_places: int = 2) -> str:
    """Evaluate a safe arithmetic expression; invalid/unresolved results are empty."""
    try:
        result = _FormulaParser(expression, values).parse()
        places = max(0, min(int(decimal_places), 10))
        quantum = Decimal(1).scaleb(-places)
        return f"{result.quantize(quantum, rounding=ROUND_HALF_UP):.{places}f}"
    except (FieldLogicError, InvalidOperation, ValueError, ArithmeticError):
        return ""


def validate_formula(expression: str) -> list[str]:
    """Parse syntax while allowing unresolved refs and return referenced IDs."""
    refs = formula_references(expression)
    sentinel = {ref: "1" for ref in refs}
    _FormulaParser(expression, sentinel).parse()
    return refs


def _selected_radio_value(parent: Any, fields: list[Any], values: Mapping[str, Any]) -> str | None:
    group_id = (_props(parent).get("group") or {}).get("id")
    if not group_id:
        return None
    for member in fields:
        if _type(member) != "radio" or (_props(member).get("group") or {}).get("id") != group_id:
            continue
        if str(values.get(str(_get(member, "id")), "")).lower() == "true":
            return str(_props(member).get("option_value", ""))
    return None


def condition_matches(rule: Mapping[str, Any], parent: Any, fields: list[Any], values: Mapping[str, Any]) -> bool:
    raw = (
        _selected_radio_value(parent, fields, values)
        if _type(parent) == "radio"
        else values.get(str(_get(parent, "id")))
    )
    current = "" if raw is None else str(raw)
    operator = rule.get("operator")
    expected = [str(value) for value in rule.get("values", [])]
    if operator == "equals":
        return bool(expected) and current == expected[0]
    if operator == "not_equals":
        return bool(expected) and current != expected[0]
    if operator == "any_of":
        return current in expected
    if operator == "checked":
        return current.lower() == "true"
    if operator == "unchecked":
        return current.lower() != "true"
    if operator == "not_empty":
        return bool(current.strip())
    return False


def resolve_visibility(fields: Iterable[Any], values: Mapping[str, Any]) -> dict[str, bool]:
    items = list(fields)
    by_id = {str(_get(field, "id")): field for field in items}
    visible = {field_id: True for field_id in by_id}
    # A valid graph is acyclic, so N passes is enough to propagate a hidden
    # parent through an arbitrarily deep condition chain.
    for _ in range(len(items) + 1):
        changed = False
        for field_id, field in by_id.items():
            rule = _props(field).get("conditional")
            if not rule or rule.get("action", "show") != "show":
                continue
            parent_id = str(rule.get("parent_field_id", ""))
            parent = by_id.get(parent_id)
            next_value = bool(parent and visible.get(parent_id, False) and condition_matches(rule, parent, items, values))
            if visible[field_id] != next_value:
                visible[field_id] = next_value
                changed = True
        if not changed:
            break
    return visible


def resolve_required(field: Any, fields: Iterable[Any], values: Mapping[str, Any], visible: Mapping[str, bool]) -> bool:
    if not visible.get(str(_get(field, "id")), True):
        return False
    rule = _props(field).get("conditional")
    if rule and rule.get("action") == "require":
        items = list(fields)
        by_id = {str(_get(item, "id")): item for item in items}
        parent_id = str(rule.get("parent_field_id", ""))
        parent = by_id.get(parent_id)
        return bool(parent and visible.get(parent_id, False) and condition_matches(rule, parent, items, values))
    return bool(_get(field, "required", False))


def compute_formulas(fields: Iterable[Any], values: Mapping[str, Any]) -> dict[str, str]:
    items = list(fields)
    resolved = {str(k): v for k, v in values.items()}
    pending = {str(_get(f, "id")): f for f in items if _type(f) == "formula"}
    for _ in range(len(pending) + 1):
        progressed = False
        for field_id, field in list(pending.items()):
            formula = _props(field).get("formula") or {}
            refs = formula_references(str(formula.get("expression", "")))
            if any(ref in pending for ref in refs):
                continue
            resolved[field_id] = evaluate_formula(
                str(formula.get("expression", "")), resolved, int(formula.get("decimal_places", 2))
            )
            pending.pop(field_id)
            progressed = True
        if not progressed:
            break
    return {str(_get(f, "id")): str(resolved.get(str(_get(f, "id")), "")) for f in items if _type(f) == "formula"}


def validate_field_graph(fields: Iterable[Any]) -> None:
    items = list(fields)
    by_id: dict[str, Any] = {}
    for field in items:
        field_id = str(_get(field, "id", ""))
        if not field_id or field_id in by_id:
            raise FieldLogicError("Every field must have a unique ID")
        by_id[field_id] = field

    edges: dict[str, set[str]] = {field_id: set() for field_id in by_id}
    radio_groups: dict[str, list[Any]] = {}
    for field_id, field in by_id.items():
        props = _props(field)
        rule = props.get("conditional")
        if rule:
            parent = str(rule.get("parent_field_id", ""))
            if parent not in by_id:
                raise FieldLogicError(f"Conditional parent field {parent} does not exist")
            if parent == field_id:
                raise FieldLogicError("A field cannot depend on itself")
            edges[field_id].add(parent)
        if _type(field) == "formula":
            formula = props.get("formula") or {}
            refs = validate_formula(str(formula.get("expression", "")))
            for ref in refs:
                target = by_id.get(ref)
                if target is None:
                    raise FieldLogicError(f"Formula field reference {ref} does not exist")
                if _type(target) in {"signature", "initials", "attachment"}:
                    raise FieldLogicError("Formula fields cannot reference signature, initials, or attachment fields")
                edges[field_id].add(ref)
        if _type(field) == "radio":
            group_id = str((props.get("group") or {}).get("id", ""))
            if not group_id:
                raise FieldLogicError("Radio fields require a group ID")
            radio_groups.setdefault(group_id, []).append(field)

    for group_id, members in radio_groups.items():
        recipients = {str(_get(member, "recipient_id", _get(member, "recipient_index"))) for member in members}
        options = [str(_props(member).get("option_value", "")) for member in members]
        if len(recipients) != 1:
            raise FieldLogicError(f"Radio group {group_id} must belong to one recipient")
        if len(options) != len(set(options)):
            raise FieldLogicError(f"Radio group {group_id} option values must be unique")

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(field_id: str) -> None:
        if field_id in visiting:
            raise FieldLogicError("Field dependency cycle detected")
        if field_id in visited:
            return
        visiting.add(field_id)
        for dependency in edges[field_id]:
            visit(dependency)
        visiting.remove(field_id)
        visited.add(field_id)

    for field_id in by_id:
        visit(field_id)


def remap_property_references(properties: Mapping[str, Any] | None, id_map: Mapping[str, str]) -> dict[str, Any]:
    result = dict(properties or {})
    conditional = result.get("conditional")
    if isinstance(conditional, Mapping):
        result["conditional"] = dict(conditional)
        old = str(conditional.get("parent_field_id", ""))
        if old in id_map:
            result["conditional"]["parent_field_id"] = id_map[old]
    formula = result.get("formula")
    if isinstance(formula, Mapping):
        result["formula"] = dict(formula)
        expression = str(formula.get("expression", ""))
        result["formula"]["expression"] = _REF_RE.sub(
            lambda match: f"[{id_map.get(match.group(1), match.group(1))}]", expression
        )
    return result
