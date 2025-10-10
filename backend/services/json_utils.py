"""
JSON utility functions for handling non-serializable objects
"""
import uuid
from typing import Any


def make_json_serializable(obj: Any) -> Any:
    """
    Convert objects to JSON-serializable format
    Handles UUID objects and recursively processes dicts and lists
    """
    if isinstance(obj, dict):
        return {k: make_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [make_json_serializable(item) for item in obj]
    elif isinstance(obj, uuid.UUID):
        return str(obj)
    else:
        return obj