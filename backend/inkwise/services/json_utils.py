"""JSON parsing helpers for Inkwise retrieval flows."""

from __future__ import annotations

import json
from typing import Any


def extract_first_json_object(text: str) -> dict[str, Any]:
    value = (text or "").strip()
    if not value:
        return {}

    try:
        obj = json.loads(value)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    start = value.find("{")
    if start < 0:
        return {}

    depth = 0
    in_string = False
    escaped = False
    for idx in range(start, len(value)):
        ch = value[idx]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                candidate = value[start : idx + 1]
                try:
                    obj = json.loads(candidate)
                    if isinstance(obj, dict):
                        return obj
                except Exception:
                    return {}
    return {}
