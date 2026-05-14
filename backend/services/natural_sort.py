"""Natural sorting helpers for user-facing file paths."""

from __future__ import annotations

import re
from typing import Any, Iterable, TypeVar


_DIGIT_RE = re.compile(r"(\d+)")
T = TypeVar("T")


def natural_text_key(value: Any) -> tuple[tuple[Any, ...], ...]:
    """Return a case-insensitive key that compares digit runs numerically."""
    text = "" if value is None else str(value).strip().casefold()
    parts: list[tuple[Any, ...]] = []
    for part in _DIGIT_RE.split(text):
        if not part:
            continue
        if part.isdigit():
            parts.append((1, int(part), len(part), part))
        else:
            parts.append((0, part))
    return tuple(parts)


def source_file_path(source_file: Any) -> str:
    return str(
        getattr(source_file, "original_path", None)
        or getattr(source_file, "original_filename", None)
        or ""
    )


def natural_source_file_key(source_file: Any) -> tuple[Any, ...]:
    return (natural_text_key(source_file_path(source_file)), str(getattr(source_file, "id", "")))


def sort_source_files_naturally(source_files: Iterable[T]) -> list[T]:
    return sorted(source_files, key=natural_source_file_key)


def sort_paths_naturally(paths: Iterable[Any]) -> list[str]:
    return sorted(("" if path is None else str(path) for path in paths), key=natural_text_key)
