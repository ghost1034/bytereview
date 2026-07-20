"""Authoritative validation and evaluation for advanced e-signature fields.

This module deliberately operates on dicts, Pydantic DTOs, and ORM rows.  It
contains no database code, which keeps the rules usable by authoring, signing,
and sealing and makes them straightforward to unit test.
"""

from __future__ import annotations

import ast
import re
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Iterable, Mapping


_REF_RE = re.compile(r"\[([^\[\]]+)\]")


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


def _formula_source(expression: str) -> str:
    """Turn stable ``[data label]`` references into safe AST calls."""
    return _REF_RE.sub(lambda m: f"REF({m.group(1)!r})", expression or "")


def _number(value: Any) -> Decimal:
    if isinstance(value, bool):
        return Decimal(1 if value else 0)
    try:
        return Decimal(str(value).replace("$", "").replace(",", "").strip())
    except (InvalidOperation, AttributeError) as exc:
        raise FieldLogicError(f"{value!r} is not numeric") from exc


def _date(value: Any) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            pass
    raise FieldLogicError(f"{value!r} is not a supported date")


class _FormulaEvaluator:
    FUNCTIONS = {"IF", "ROUND", "MIN", "MAX", "SUM", "FLOOR", "CEILING", "DATEADD", "DATEDIFF"}

    def __init__(self, expression: str, values: Mapping[str, Any]):
        self.values = values
        try:
            self.tree = ast.parse(_formula_source(expression), mode="eval")
        except SyntaxError as exc:
            raise FieldLogicError("Invalid formula syntax") from exc

    def parse(self) -> Any:
        return self._eval(self.tree.body)

    def _eval(self, node: ast.AST) -> Any:
        if isinstance(node, ast.Constant) and isinstance(node.value, (str, int, float, bool)):
            return Decimal(str(node.value)) if isinstance(node.value, (int, float)) and not isinstance(node.value, bool) else node.value
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub)):
            value = _number(self._eval(node.operand))
            return value if isinstance(node.op, ast.UAdd) else -value
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
            left, right = _number(self._eval(node.left)), _number(self._eval(node.right))
            if isinstance(node.op, ast.Add): return left + right
            if isinstance(node.op, ast.Sub): return left - right
            if isinstance(node.op, ast.Mult): return left * right
            if right == 0: raise FieldLogicError("Division by zero")
            return left / right
        if isinstance(node, ast.Compare):
            if len(node.ops) != 1:
                raise FieldLogicError("Chained comparisons are not supported")
            left = self._eval(node.left)
            for operator, comparator in zip(node.ops, node.comparators):
                right = self._eval(comparator)
                if isinstance(left, Decimal) or isinstance(right, Decimal) or isinstance(operator, (ast.Lt, ast.LtE, ast.Gt, ast.GtE)):
                    try:
                        left, right = _number(left), _number(right)
                    except FieldLogicError:
                        left, right = str(left), str(right)
                if isinstance(operator, ast.Eq): ok = left == right
                elif isinstance(operator, ast.NotEq): ok = left != right
                elif isinstance(operator, ast.Lt): ok = left < right
                elif isinstance(operator, ast.LtE): ok = left <= right
                elif isinstance(operator, ast.Gt): ok = left > right
                elif isinstance(operator, ast.GtE): ok = left >= right
                else: raise FieldLogicError("Unsupported comparison")
                if not ok: return False
                left = right
            return True
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            name = node.func.id.upper()
            if node.keywords or (name not in self.FUNCTIONS and name != "REF"):
                raise FieldLogicError("Unsupported formula function")
            if name == "IF":
                if len(node.args) != 3: raise FieldLogicError("IF requires condition, true value, false value")
                return self._eval(node.args[1]) if bool(self._eval(node.args[0])) else self._eval(node.args[2])
            args = [self._eval(arg) for arg in node.args]
            if name == "REF":
                if len(args) != 1: raise FieldLogicError("REF requires one field label")
                ref = str(args[0])
                raw = self.values.get(ref)
                if raw is None or str(raw).strip() == "": raise FieldLogicError(f"Unresolved field reference [{ref}]")
                return raw
            if name in {"MIN", "MAX", "SUM"}:
                numbers = [_number(item) for arg in args for item in (arg if isinstance(arg, (list, tuple)) else [arg])]
                if not numbers: raise FieldLogicError(f"{name} requires values")
                return sum(numbers, Decimal(0)) if name == "SUM" else (min(numbers) if name == "MIN" else max(numbers))
            if name == "ROUND":
                if not 1 <= len(args) <= 2: raise FieldLogicError("ROUND requires a value and optional places")
                places = int(_number(args[1])) if len(args) == 2 else 0
                return _number(args[0]).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
            if name in {"FLOOR", "CEILING"}:
                if len(args) != 1: raise FieldLogicError(f"{name} requires one value")
                rounding = "ROUND_FLOOR" if name == "FLOOR" else "ROUND_CEILING"
                return _number(args[0]).to_integral_value(rounding=rounding)
            if name == "DATEADD":
                if len(args) not in (2, 3): raise FieldLogicError("DATEADD requires date, amount, and optional unit")
                unit = str(args[2]).lower() if len(args) == 3 else "day"
                amount = int(_number(args[1]))
                if unit not in {"day", "days"}: raise FieldLogicError("DATEADD currently supports days")
                return _date(args[0]) + timedelta(days=amount)
            if name == "DATEDIFF":
                if len(args) not in (2, 3): raise FieldLogicError("DATEDIFF requires two dates and optional unit")
                unit = str(args[2]).lower() if len(args) == 3 else "day"
                if unit not in {"day", "days"}: raise FieldLogicError("DATEDIFF currently supports days")
                return Decimal((_date(args[1]) - _date(args[0])).days)
        raise FieldLogicError("Unsupported formula expression")


def evaluate_formula(expression: str, values: Mapping[str, Any], decimal_places: int = 2) -> str:
    """Evaluate a safe expression; invalid/unresolved results are empty."""
    try:
        result = _FormulaEvaluator(expression, values).parse()
        if isinstance(result, (date, datetime)):
            return result.strftime("%Y-%m-%d")
        if isinstance(result, bool):
            return "true" if result else "false"
        result = _number(result)
        places = max(0, min(int(decimal_places), 10))
        quantum = Decimal(1).scaleb(-places)
        return f"{result.quantize(quantum, rounding=ROUND_HALF_UP):.{places}f}"
    except (FieldLogicError, InvalidOperation, ValueError, ArithmeticError):
        return ""


def validate_formula(expression: str) -> list[str]:
    """Validate the AST without executing it and return stable labels/legacy IDs."""
    refs = formula_references(expression)
    evaluator = _FormulaEvaluator(expression, {})
    allowed_nodes = (
        ast.Expression, ast.Constant, ast.UnaryOp, ast.UAdd, ast.USub, ast.BinOp,
        ast.Add, ast.Sub, ast.Mult, ast.Div,
        ast.Compare, ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE,
        ast.Call, ast.Name, ast.Load,
    )
    for node in ast.walk(evaluator.tree):
        if not isinstance(node, allowed_nodes):
            raise FieldLogicError("Unsupported formula expression")
        if isinstance(node, ast.Name) and node.id.upper() not in evaluator.FUNCTIONS | {"REF"}:
            raise FieldLogicError(f"Unsupported formula function: {node.id}")
        if isinstance(node, ast.Call) and (not isinstance(node.func, ast.Name) or node.keywords):
            raise FieldLogicError("Unsupported formula call")
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
    labels_by_owner: dict[str, dict[str, str]] = {}
    for field in items:
        label = str((_props(field).get("data_label") or "")).strip()
        owner = str(_get(field, "recipient_id", _get(field, "recipient_index")))
        if label:
            labels_by_owner.setdefault(owner, {})[label] = str(_get(field, "id"))
    pending = {str(_get(f, "id")): f for f in items if _type(f) == "formula"}
    for _ in range(len(pending) + 1):
        progressed = False
        for field_id, field in list(pending.items()):
            formula = _props(field).get("formula") or {}
            refs = formula_references(str(formula.get("expression", "")))
            owner = str(_get(field, "recipient_id", _get(field, "recipient_index")))
            labels = labels_by_owner.get(owner, {})
            if any((labels.get(ref, ref)) in pending for ref in refs):
                continue
            formula_values = dict(resolved)
            for label, referenced_id in labels.items():
                formula_values[label] = resolved.get(referenced_id)
            resolved[field_id] = evaluate_formula(
                str(formula.get("expression", "")), formula_values, int(formula.get("decimal_places", 2))
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
    by_label: dict[tuple[str, str], Any] = {}
    for field in items:
        label = str((_props(field).get("data_label") or "")).strip()
        owner = str(_get(field, "recipient_id", _get(field, "recipient_index")))
        if label:
            key = (owner, label)
            if key in by_label:
                # A repeated label is intentional only for explicitly shared fields.
                if not (_props(field).get("shared_value") and _props(by_label[key]).get("shared_value")):
                    raise FieldLogicError(f"Data label '{label}' must be unique unless shared_value is enabled")
            else:
                by_label[key] = field
    radio_groups: dict[str, list[Any]] = {}
    checkbox_groups: dict[str, list[Any]] = {}
    for field_id, field in by_id.items():
        props = _props(field)
        rule = props.get("conditional")
        if rule:
            parent = str(rule.get("parent_field_id", ""))
            if parent not in by_id:
                raise FieldLogicError(f"Conditional parent field {parent} does not exist")
            if parent == field_id:
                raise FieldLogicError("A field cannot depend on itself")
            if str(_get(by_id[parent], "recipient_id", _get(by_id[parent], "recipient_index"))) != str(
                _get(field, "recipient_id", _get(field, "recipient_index"))
            ):
                raise FieldLogicError("Conditional fields must belong to the same recipient")
            edges[field_id].add(parent)
        if _type(field) == "formula":
            formula = props.get("formula") or {}
            refs = validate_formula(str(formula.get("expression", "")))
            owner = str(_get(field, "recipient_id", _get(field, "recipient_index")))
            for ref in refs:
                target = by_label.get((owner, ref)) or by_id.get(ref)  # UUID lookup is the legacy path.
                if target is None:
                    if any(label == ref for (_other_owner, label) in by_label):
                        raise FieldLogicError("Formula fields may only reference the same recipient")
                    raise FieldLogicError(f"Formula field reference {ref} does not exist")
                if _type(target) in {"signature", "initials", "stamp", "attachment"}:
                    raise FieldLogicError("Formula fields cannot reference signature-like or attachment fields")
                if str(_get(target, "recipient_id", _get(target, "recipient_index"))) != str(
                    _get(field, "recipient_id", _get(field, "recipient_index"))
                ):
                    raise FieldLogicError("Formula fields may only reference the same recipient")
                edges[field_id].add(str(_get(target, "id")))
        if _type(field) == "radio":
            group_id = str((props.get("group") or {}).get("id", ""))
            if not group_id:
                raise FieldLogicError("Radio fields require a group ID")
            radio_groups.setdefault(group_id, []).append(field)
        if _type(field) == "checkbox" and props.get("selection_group"):
            group_id = str((props.get("selection_group") or {}).get("id", ""))
            if not group_id:
                raise FieldLogicError("Checkbox selection groups require an ID")
            checkbox_groups.setdefault(group_id, []).append(field)

    for group_id, members in radio_groups.items():
        recipients = {str(_get(member, "recipient_id", _get(member, "recipient_index"))) for member in members}
        options = [str(_props(member).get("option_value", "")) for member in members]
        if len(recipients) != 1:
            raise FieldLogicError(f"Radio group {group_id} must belong to one recipient")
        if len(options) != len(set(options)):
            raise FieldLogicError(f"Radio group {group_id} option values must be unique")
        labels = {str((_props(member).get("group") or {}).get("label") or "") for member in members}
        required_states = {bool(_get(member, "required", False)) for member in members}
        defaults = [member for member in members if _props(member).get("sender_prefill") == "true"]
        if len(labels) != 1 or len(required_states) != 1:
            raise FieldLogicError(f"Radio group {group_id} must use one label and required state")
        if len(defaults) > 1:
            raise FieldLogicError(f"Radio group {group_id} has more than one default option")

    for group_id, members in checkbox_groups.items():
        recipients = {str(_get(member, "recipient_id", _get(member, "recipient_index"))) for member in members}
        definitions = {
            str(sorted((_props(member).get("selection_group") or {}).items()))
            for member in members
        }
        if len(recipients) != 1:
            raise FieldLogicError(f"Checkbox group {group_id} must belong to one recipient")
        if len(definitions) != 1:
            raise FieldLogicError(f"Checkbox group {group_id} must use one consistent definition")

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


def validate_field_value(field: Any, value: Any, *, date_format: str = "MM/DD/YYYY") -> str | None:
    """Normalize and validate one signer-entered value without logging it."""
    props = _props(field)
    field_type = _type(field)
    text = "" if value is None else str(value).strip()
    if props.get("read_only"):
        expected = "" if props.get("sender_prefill") is None else str(props.get("sender_prefill"))
        if text and text != expected:
            raise FieldLogicError(f"Field '{_get(field, 'label') or field_type}' is read-only")
        return expected or None
    text_rules = props.get("text_validation") or {}
    maximum = text_rules.get("max_length")
    if maximum is not None and len(text) > int(maximum):
        raise FieldLogicError(f"Field '{_get(field, 'label') or field_type}' exceeds {maximum} characters")
    pattern = text_rules.get("regex")
    if text and pattern and re.fullmatch(str(pattern), text) is None:
        raise FieldLogicError(
            str(text_rules.get("message") or f"Field '{_get(field, 'label') or field_type}' has an invalid format")
        )
    if field_type == "number" and text:
        if re.fullmatch(r"-?(?:\d+(?:\.\d*)?|\.\d+)", text) is None:
            raise FieldLogicError(f"Field '{_get(field, 'label') or field_type}' must be a decimal number")
        number = _number(text)
        rules = props.get("number_validation") or {}
        if not rules.get("allow_negative", True) and number < 0:
            raise FieldLogicError(f"Field '{_get(field, 'label') or field_type}' cannot be negative")
        if rules.get("minimum") is not None and number < _number(rules["minimum"]):
            raise FieldLogicError(f"Field '{_get(field, 'label') or field_type}' is below its minimum")
        if rules.get("maximum") is not None and number > _number(rules["maximum"]):
            raise FieldLogicError(f"Field '{_get(field, 'label') or field_type}' exceeds its maximum")
        places = rules.get("decimal_places")
        if places is not None and max(0, -number.as_tuple().exponent) > int(places):
            raise FieldLogicError(f"Field '{_get(field, 'label') or field_type}' has too many decimal places")
        return text
    if field_type == "date" and text:
        # Persist dates in one unambiguous form. Parsing the configured
        # display format remains a compatibility path for older drafts.
        try:
            parsed = date.fromisoformat(text)
        except ValueError:
            parsed = parse_date_value(text, date_format)
        rules = props.get("date_validation") or {}
        if rules.get("minimum") and parsed < date.fromisoformat(str(rules["minimum"])):
            raise FieldLogicError(f"Field '{_get(field, 'label') or field_type}' is before its minimum")
        if rules.get("maximum") and parsed > date.fromisoformat(str(rules["maximum"])):
            raise FieldLogicError(f"Field '{_get(field, 'label') or field_type}' is after its maximum")
        return parsed.isoformat()
    if field_type == "dropdown" and text:
        allowed = {str(item.get("value")) for item in props.get("options", [])}
        if text not in allowed:
            raise FieldLogicError(f"Invalid option for '{_get(field, 'label') or 'dropdown'}'")
    return text or None


_DATE_FORMATS = {
    "MM/DD/YYYY": "%m/%d/%Y", "DD/MM/YYYY": "%d/%m/%Y",
    "YYYY-MM-DD": "%Y-%m-%d", "MMM D, YYYY": "%b %d, %Y",
}


def parse_date_value(value: str, date_format: str) -> date:
    try:
        return datetime.strptime(value.strip(), _DATE_FORMATS.get(date_format, "%m/%d/%Y")).date()
    except ValueError as exc:
        raise FieldLogicError(f"Date must use {date_format}") from exc


def format_date_value(value: date | datetime, date_format: str) -> str:
    result = value.strftime(_DATE_FORMATS.get(date_format, "%m/%d/%Y"))
    return result.replace(" 0", " ") if date_format == "MMM D, YYYY" else result


def resolve_display_value(
    field: Any, value: Any, *, recipient: Any = None, date_format: str = "MM/DD/YYYY",
) -> str:
    """Canonical display used by signer overlays and PDF flattening."""
    props = _props(field)
    field_type = _type(field)
    text = "" if value is None else str(value)
    if field_type == "dropdown":
        for option in props.get("options", []):
            if str(option.get("value")) == text:
                return str(option.get("label", text))
    if (
        field_type in {"date", "date_signed"}
        or (field_type == "auto_fill" and props.get("auto_source") == "date_sent")
    ) and text:
        try:
            return format_date_value(date.fromisoformat(text), date_format)
        except ValueError:
            return text
    if field_type == "note":
        return str(props.get("sender_prefill") or text)
    if field_type in {"first_name", "last_name", "full_name", "email"} and recipient is not None:
        name = str(_get(recipient, "name", ""))
        if field_type == "first_name": return name.split()[0] if name.split() else ""
        if field_type == "last_name": return name.split()[-1] if name.split() else ""
        if field_type == "full_name": return name
        return str(_get(recipient, "email", ""))
    return text


def synchronize_shared_values(fields: Iterable[Any], values: Mapping[str, Any]) -> dict[str, Any]:
    """Copy a supplied value only among same-recipient fields opting into sharing."""
    result = {str(key): value for key, value in values.items()}
    groups: dict[tuple[str, str], list[Any]] = {}
    for field in fields:
        props = _props(field)
        label = str(props.get("data_label") or "").strip()
        if label and props.get("shared_value"):
            owner = str(_get(field, "recipient_id", _get(field, "recipient_index")))
            groups.setdefault((owner, label), []).append(field)
    for members in groups.values():
        supplied = next((result[str(_get(field, "id"))] for field in members if str(_get(field, "id")) in result), None)
        if supplied is not None:
            for field in members:
                result[str(_get(field, "id"))] = supplied
    return result
