"""Shared PDF anchor-placement geometry.

The E-Signature and Form Fill products use the same normalized page model so
an anchor rule has identical edge handling in both modules.
"""

from __future__ import annotations


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
