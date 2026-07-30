"""Coordinate-convention round-trip tests for e-sign field stamping.

Locks the highest-risk convention in the module: field coordinates are
fractions of the *display* (rotation-aware) page size, top-left origin,
0-based page index. The backend maps them into PyMuPDF's unrotated insert
coordinates via page.derotation_matrix + rotate=page.rotation.

These tests rasterize real pages and assert the ink lands inside the
expected display rectangle for every page rotation.
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import fitz

from services.esign.sealing_service import (
    _aligned_content_box,
    _display_box,
    _display_rect,
    _fit_textbox,
    _insert_aligned_image,
)


def _page_with_rotation(rotation: int) -> fitz.Document:
    doc = fitz.open()
    doc.new_page(width=612, height=792)
    data = doc.tobytes()
    doc.close()
    d = fitz.open(stream=data, filetype="pdf")
    d[0].set_rotation(rotation)
    data = d.tobytes()
    d.close()
    return fitz.open(stream=data, filetype="pdf")


def _ink_bbox(page: fitz.Page) -> tuple[float, float, float, float]:
    """Bounding box of non-white pixels in display coordinates (72 dpi)."""
    pix = page.get_pixmap(dpi=72)
    min_x = min_y = 10**9
    max_x = max_y = -1
    for y in range(pix.height):
        for x in range(pix.width):
            r, g, b = pix.pixel(x, y)
            if r < 200 or g < 200 or b < 200:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    return min_x, min_y, max_x, max_y


def _longest_ink_runs(page: fitz.Page) -> tuple[int, int]:
    """Longest horizontal and vertical dark-pixel runs in display space."""
    pix = page.get_pixmap(dpi=72)
    dark = [
        [min(pix.pixel(x, y)[:3]) < 200 for x in range(pix.width)]
        for y in range(pix.height)
    ]
    horizontal = 0
    for row in dark:
        current = 0
        for value in row:
            current = current + 1 if value else 0
            horizontal = max(horizontal, current)
    vertical = 0
    for x in range(pix.width):
        current = 0
        for y in range(pix.height):
            current = current + 1 if dark[y][x] else 0
            vertical = max(vertical, current)
    return horizontal, vertical


class EsignCoordinateTests(unittest.TestCase):
    def test_content_box_supports_all_alignment_edges(self) -> None:
        box = fitz.Rect(10, 20, 110, 120)
        top = _aligned_content_box(box, 40, 20, "left", "top")
        bottom = _aligned_content_box(box, 40, 20, "right", "bottom")
        left = _aligned_content_box(box, 20, 40, "left", "top")
        right = _aligned_content_box(box, 20, 40, "right", "bottom")

        self.assertEqual(top, fitz.Rect(10, 20, 110, 70))
        self.assertEqual(bottom, fitz.Rect(10, 70, 110, 120))
        self.assertEqual(left, fitz.Rect(10, 20, 60, 120))
        self.assertEqual(right, fitz.Rect(60, 20, 110, 120))

    def test_display_rect_matches_fraction_box_unrotated(self) -> None:
        doc = _page_with_rotation(0)
        page = doc[0]
        rect = _display_rect(page, 0.25, 0.5, 0.3, 0.1)
        self.assertAlmostEqual(rect.x0, 0.25 * 612, places=3)
        self.assertAlmostEqual(rect.y0, 0.5 * 792, places=3)
        self.assertAlmostEqual(rect.width, 0.3 * 612, places=3)
        self.assertAlmostEqual(rect.height, 0.1 * 792, places=3)

    def test_text_lands_in_display_rect_for_all_rotations(self) -> None:
        frac = dict(pos_x=0.1, pos_y=0.1, width=0.35, height=0.1)
        for rotation in (0, 90, 180, 270):
            with self.subTest(rotation=rotation):
                doc = _page_with_rotation(rotation)
                page = doc[0]
                pw, ph = page.rect.width, page.rect.height
                box = _display_box(page, frac["pos_x"], frac["pos_y"], frac["width"], frac["height"])
                _fit_textbox(
                    page, box, "HELLO", fontname="helv", rotate=page.rotation, max_fontsize=16
                )
                min_x, min_y, max_x, max_y = _ink_bbox(page)
                self.assertGreater(max_x, 0, "no ink rendered")
                # Expected display-space box (72 dpi == PDF points)
                ex0, ey0 = frac["pos_x"] * pw, frac["pos_y"] * ph
                ex1 = (frac["pos_x"] + frac["width"]) * pw
                ey1 = (frac["pos_y"] + frac["height"]) * ph
                slack = 3  # antialiasing
                self.assertGreaterEqual(min_x, ex0 - slack, f"rot {rotation}: ink left of box")
                self.assertGreaterEqual(min_y, ey0 - slack, f"rot {rotation}: ink above box")
                self.assertLessEqual(max_x, ex1 + slack, f"rot {rotation}: ink right of box")
                self.assertLessEqual(max_y, ey1 + slack, f"rot {rotation}: ink below box")
                # Text must read horizontally in display space (wider than tall)
                self.assertGreater(max_x - min_x, max_y - min_y, f"rot {rotation}: text not horizontal")
                # Text must be vertically centered in the box (previews center
                # content, so the flatten must too).
                ink_center_y = (min_y + max_y) / 2
                box_center_y = (ey0 + ey1) / 2
                self.assertLessEqual(
                    abs(ink_center_y - box_center_y),
                    0.15 * (ey1 - ey0),
                    f"rot {rotation}: text not vertically centered",
                )

    def test_text_vertical_alignment_moves_content_to_requested_edge(self) -> None:
        centers = {}
        for alignment in ("top", "middle", "bottom"):
            doc = _page_with_rotation(0)
            page = doc[0]
            box = _display_box(page, 0.1, 0.1, 0.35, 0.15)
            _fit_textbox(
                page,
                box,
                "HELLO",
                fontname="helv",
                rotate=0,
                max_fontsize=16,
                vertical_align=alignment,
            )
            _, min_y, _, max_y = _ink_bbox(page)
            centers[alignment] = (min_y + max_y) / 2
            doc.close()

        self.assertLess(centers["top"], centers["middle"])
        self.assertLess(centers["middle"], centers["bottom"])

    def test_image_lands_in_display_rect_for_all_rotations(self) -> None:
        pm = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 40, 20))
        for y in range(20):
            for x in range(40):
                pm.set_pixel(x, y, (0, 0, 0))
        png = pm.tobytes("png")

        frac = dict(pos_x=0.2, pos_y=0.3, width=0.3, height=0.1)
        for rotation in (0, 90, 180, 270):
            with self.subTest(rotation=rotation):
                doc = _page_with_rotation(rotation)
                page = doc[0]
                pw, ph = page.rect.width, page.rect.height
                target = _display_rect(page, frac["pos_x"], frac["pos_y"], frac["width"], frac["height"])
                page.insert_image(target, stream=png, rotate=page.rotation, keep_proportion=True)
                min_x, min_y, max_x, max_y = _ink_bbox(page)
                ex0, ey0 = frac["pos_x"] * pw, frac["pos_y"] * ph
                ex1 = (frac["pos_x"] + frac["width"]) * pw
                ey1 = (frac["pos_y"] + frac["height"]) * ph
                slack = 3
                self.assertGreaterEqual(min_x, ex0 - slack)
                self.assertGreaterEqual(min_y, ey0 - slack)
                self.assertLessEqual(max_x, ex1 + slack)
                self.assertLessEqual(max_y, ey1 + slack)

    def test_image_vertical_alignment_moves_content_to_requested_edge(self) -> None:
        pm = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 40, 10))
        pm.clear_with(0)
        png = pm.tobytes("png")
        centers = {}

        for alignment in ("top", "middle", "bottom"):
            doc = _page_with_rotation(0)
            page = doc[0]
            box = _display_box(page, 0.1, 0.1, 0.35, 0.15)
            _insert_aligned_image(
                page,
                box,
                png,
                rotate=0,
                horizontal_align="center",
                vertical_align=alignment,
            )
            _, min_y, _, max_y = _ink_bbox(page)
            centers[alignment] = (min_y + max_y) / 2
            doc.close()

        self.assertLess(centers["top"], centers["middle"])
        self.assertLess(centers["middle"], centers["bottom"])

    def test_underlines_follow_text_for_all_page_rotations(self) -> None:
        for rotation in (0, 90, 180, 270):
            with self.subTest(rotation=rotation):
                doc = _page_with_rotation(rotation)
                page = doc[0]
                box = _display_box(page, 0.1, 0.2, 0.5, 0.1)
                _fit_textbox(
                    page,
                    box,
                    "UNDERLINED FIELD",
                    fontname="helv",
                    rotate=page.rotation,
                    max_fontsize=16,
                    align=fitz.TEXT_ALIGN_CENTER,
                    underline=True,
                )
                horizontal, vertical = _longest_ink_runs(page)
                self.assertGreater(horizontal, 80, f"rot {rotation}: underline is missing")
                self.assertGreater(
                    horizontal,
                    vertical * 3,
                    f"rot {rotation}: underline is not horizontal in display space",
                )
                # The browser underlines the glyph run, not the entire field.
                self.assertLess(horizontal, box.width * 0.8)


if __name__ == "__main__":
    unittest.main()
