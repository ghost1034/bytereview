"""Shared PDF anchor-placement geometry.

The E-Signature and Form Fill products use the same normalized page model so
an anchor rule has identical edge handling in both modules.
"""

from __future__ import annotations

import re
from typing import Any

import fitz


def search_pdf_anchor_text(
    page: fitz.Page, value: str, *, case_sensitive: bool = False, whole_word: bool = False,
) -> list[fitz.Rect]:
    """Search one page with common E-Signature/Form Fill semantics."""
    matches: list[fitz.Rect] = []
    for raw_rect in page.search_for(value):
        found_text = page.get_textbox(raw_rect).strip()
        if case_sensitive and found_text != value:
            continue
        if whole_word:
            flags = 0 if case_sensitive else re.IGNORECASE
            if re.fullmatch(rf"\b{re.escape(value)}\b", found_text, flags=flags) is None:
                continue
        matches.append(raw_rect)
    return matches


def resolve_contextual_anchor_rect(page: fitz.Page, item: dict[str, Any]) -> tuple[fitz.Rect | None, str | None]:
    """Resolve an AI anchor only when its context identifies one unique hit."""
    anchor = str(item.get("anchor_text") or item.get("anchor") or "").strip()
    before = str(item.get("anchor_before") or "").strip()
    after = str(item.get("anchor_after") or "").strip()
    if not anchor:
        return None, "The model did not return anchor text."
    matches = search_pdf_anchor_text(
        page, anchor,
        case_sensitive=bool(item.get("case_sensitive")),
        whole_word=bool(item.get("whole_word")),
    )
    if not matches:
        return None, f'Anchor "{anchor[:80]}" was not found.'
    if len(matches) == 1:
        return matches[0], None

    before_matches = search_pdf_anchor_text(page, before) if before else []
    after_matches = search_pdf_anchor_text(page, after) if after else []

    def center(rect: fitz.Rect) -> tuple[float, float]:
        return ((rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2)

    def reading_delta(left: fitz.Rect, right: fitz.Rect) -> float:
        lx, ly = center(left); rx, ry = center(right)
        return abs(ry - ly) * max(page.rect.width, 1) + abs(rx - lx)

    scored: list[tuple[float, fitz.Rect]] = []
    for match in matches:
        score = 0.0
        if before_matches:
            eligible = [rect for rect in before_matches if rect.y0 < match.y1 or (rect.y0 <= match.y1 and rect.x0 < match.x0)]
            if not eligible:
                continue
            score += min(reading_delta(rect, match) for rect in eligible)
        if after_matches:
            eligible = [rect for rect in after_matches if rect.y1 > match.y0 or (rect.y1 >= match.y0 and rect.x1 > match.x1)]
            if not eligible:
                continue
            score += min(reading_delta(match, rect) for rect in eligible)
        scored.append((score, match))
    if not scored or (not before_matches and not after_matches):
        return None, f'Anchor "{anchor[:80]}" appears more than once and its context is ambiguous.'
    scored.sort(key=lambda row: row[0])
    if len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 1e-6:
        return None, f'Anchor "{anchor[:80]}" could not be resolved uniquely.'
    return scored[0][1], None


def relative_anchor_box_position(
    anchor_x: float,
    anchor_y: float,
    anchor_width: float,
    anchor_height: float,
    *,
    relative_position: str,
    cross_axis_alignment: str,
    field_width: float,
    field_height: float,
    offset_x: float = 0,
    offset_y: float = 0,
) -> tuple[float, float]:
    """Place a complete field box around a normalized anchor rectangle.

    Automatic choices are evaluated in deterministic order. If no candidate
    fits fully on the page, the candidate with the greatest visible area wins
    before its top-left corner is clamped into the page.
    """
    placements = (
        ("right", "left", "below", "above")
        if relative_position == "auto" else (relative_position,)
    )
    alignments = (
        ("center", "start", "end")
        if cross_axis_alignment == "auto" else (cross_axis_alignment,)
    )

    def candidate(placement: str, alignment: str) -> tuple[float, float]:
        if placement == "center":
            x = anchor_x + (anchor_width - field_width) / 2
            y = anchor_y + (anchor_height - field_height) / 2
        elif placement in ("right", "left"):
            x = anchor_x + anchor_width if placement == "right" else anchor_x - field_width
            if alignment == "start":
                y = anchor_y
            elif alignment == "end":
                y = anchor_y + anchor_height - field_height
            else:
                y = anchor_y + (anchor_height - field_height) / 2
        else:
            y = anchor_y + anchor_height if placement == "below" else anchor_y - field_height
            if alignment == "start":
                x = anchor_x
            elif alignment == "end":
                x = anchor_x + anchor_width - field_width
            else:
                x = anchor_x + (anchor_width - field_width) / 2
        return x + offset_x, y + offset_y

    def visible_area(x: float, y: float) -> float:
        visible_width = max(0.0, min(1.0, x + field_width) - max(0.0, x))
        visible_height = max(0.0, min(1.0, y + field_height) - max(0.0, y))
        return visible_width * visible_height

    best: tuple[float, float] | None = None
    best_area = -1.0
    epsilon = 1e-12
    for placement in placements:
        for alignment in alignments:
            x, y = candidate(placement, alignment)
            if (
                x >= -epsilon and y >= -epsilon
                and x + field_width <= 1.0 + epsilon
                and y + field_height <= 1.0 + epsilon
            ):
                return (
                    max(0.0, min(max(0.0, 1.0 - field_width), x)),
                    max(0.0, min(max(0.0, 1.0 - field_height), y)),
                )
            area = visible_area(x, y)
            if area > best_area + epsilon:
                best = (x, y)
                best_area = area

    x, y = best or (0.0, 0.0)
    return (
        max(0.0, min(max(0.0, 1.0 - field_width), x)),
        max(0.0, min(max(0.0, 1.0 - field_height), y)),
    )
