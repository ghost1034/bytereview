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

from services.esign.sealing_service import _display_rect, _fit_textbox


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


class EsignCoordinateTests(unittest.TestCase):
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
                target = _display_rect(page, frac["pos_x"], frac["pos_y"], frac["width"], frac["height"])
                _fit_textbox(
                    page, target, "HELLO", fontname="helv", rotate=page.rotation, max_fontsize=16
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


if __name__ == "__main__":
    unittest.main()
