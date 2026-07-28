from __future__ import annotations

import os
import sys
import types
import unittest
import uuid
from pathlib import Path

import fitz

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.esign.envelope_service import EsignEnvelopeService, EsignError, validate_field_placement


class AnchorSearchTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _service_for_pdf(content: bytes) -> EsignEnvelopeService:
        blob = types.SimpleNamespace(download_as_bytes=lambda: content)
        bucket = types.SimpleNamespace(blob=lambda _name: blob)
        service = EsignEnvelopeService.__new__(EsignEnvelopeService)
        service.storage = types.SimpleNamespace(bucket=bucket)
        return service

    async def test_rotated_page_returns_display_fraction_coordinates(self) -> None:
        pdf = fitz.open()
        page = pdf.new_page(width=612, height=792)
        page.insert_text((72, 144), "CLIENT_SIGNATURE_ANCHOR")
        page.set_rotation(90)
        content = pdf.tobytes()
        pdf.close()

        service = self._service_for_pdf(content)
        document_id = uuid.uuid4()
        document = types.SimpleNamespace(id=document_id, gcs_object_name="anchor.pdf")

        result = await service._search_anchors(
            [document], anchor="CLIENT_SIGNATURE_ANCHOR", case_sensitive=True, document_ids=None
        )

        self.assertEqual(len(result.matches), 1)
        match = result.matches[0]
        self.assertEqual(match.document_id, str(document_id))
        self.assertEqual(match.page_number, 0)
        for value in (match.x, match.y, match.width, match.height):
            self.assertGreaterEqual(value, 0)
            self.assertLessEqual(value, 1)

    async def test_alignment_uses_the_corresponding_field_edge(self) -> None:
        pdf = fitz.open()
        page = pdf.new_page(width=612, height=792)
        page.insert_text((144, 200), "ANCHOR")
        content = pdf.tobytes()
        pdf.close()
        service = self._service_for_pdf(content)
        document = types.SimpleNamespace(id=uuid.uuid4(), gcs_object_name="anchor.pdf")

        matches = {}
        for alignment in ("left", "center", "right", "after"):
            result = await service._search_anchors(
                [document], anchor="ANCHOR", case_sensitive=True,
                horizontal_alignment=alignment, field_width=0.2, field_height=0.1,
            )
            matches[alignment] = result.matches[0]

        self.assertAlmostEqual(matches["left"].x, matches["left"].reference_x)
        self.assertAlmostEqual(matches["center"].x + 0.1, matches["center"].reference_x)
        self.assertAlmostEqual(matches["right"].x + 0.2, matches["right"].reference_x)
        self.assertAlmostEqual(matches["after"].x, matches["after"].reference_x)
        self.assertLess(matches["right"].x, matches["after"].x)

    async def test_field_is_vertically_centered_on_anchor_text(self) -> None:
        pdf = fitz.open()
        page = pdf.new_page(width=612, height=792)
        page.insert_text((72, 200), "Signature:")
        anchor_rect = page.search_for("Signature:")[0]
        content = pdf.tobytes()
        pdf.close()
        service = self._service_for_pdf(content)
        document = types.SimpleNamespace(id=uuid.uuid4(), gcs_object_name="anchor.pdf")

        field_height = 0.06
        result = await service._search_anchors(
            [document], anchor="Signature:", case_sensitive=True,
            horizontal_alignment="after", field_width=0.2, field_height=field_height,
        )

        match = result.matches[0]
        anchor_center = (anchor_rect.y0 + anchor_rect.y1) / 2 / 792
        self.assertAlmostEqual(match.reference_y, anchor_center)
        self.assertAlmostEqual(match.y + field_height / 2, anchor_center)

    async def test_point_only_anchor_search_preserves_top_edge_y(self) -> None:
        pdf = fitz.open()
        page = pdf.new_page(width=612, height=792)
        page.insert_text((72, 200), "Signature:")
        anchor_rect = page.search_for("Signature:")[0]
        content = pdf.tobytes()
        pdf.close()
        service = self._service_for_pdf(content)
        document = types.SimpleNamespace(id=uuid.uuid4(), gcs_object_name="anchor.pdf")

        result = await service._search_anchors(
            [document], anchor="Signature:", case_sensitive=True,
        )

        self.assertAlmostEqual(result.matches[0].y, anchor_rect.y0 / 792)

    async def test_field_box_is_clamped_inside_page_after_offsets(self) -> None:
        pdf = fitz.open()
        page = pdf.new_page(width=612, height=792)
        page.insert_text((500, 700), "EDGE_ANCHOR")
        content = pdf.tobytes()
        pdf.close()
        service = self._service_for_pdf(content)
        document = types.SimpleNamespace(id=uuid.uuid4(), gcs_object_name="anchor.pdf")

        result = await service._search_anchors(
            [document], anchor="EDGE_ANCHOR", case_sensitive=True,
            horizontal_alignment="after", offset_x=500, offset_y=500,
            field_width=0.2, field_height=0.1,
        )
        match = result.matches[0]
        self.assertAlmostEqual(match.x, 0.8)
        self.assertAlmostEqual(match.y, 0.9)
        self.assertLessEqual(match.x + 0.2, 1)
        self.assertLessEqual(match.y + 0.1, 1)

    def test_send_time_position_uses_resized_field_dimensions(self) -> None:
        x, y = EsignEnvelopeService._anchor_field_position(
            0.95, 0.98, horizontal_alignment="right",
            field_width=0.3, field_height=0.12,
        )
        self.assertAlmostEqual(x, 0.65)
        self.assertAlmostEqual(y, 0.88)

        x, y = EsignEnvelopeService._anchor_field_position(
            0.4, 0.5, horizontal_alignment="after",
            field_width=0.2, field_height=0.12,
        )
        self.assertAlmostEqual(x, 0.4)
        self.assertAlmostEqual(y, 0.44)

    def test_pdf_widget_inspection_preserves_metadata_and_geometry(self) -> None:
        pdf = fitz.open()
        page = pdf.new_page(width=612, height=792)
        widget = fitz.Widget()
        widget.field_name = "Invoice Amount"
        widget.field_label = "Amount due"
        widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
        widget.field_value = "12.50"
        widget.field_flags = 2
        widget.text_maxlen = 12
        widget.rect = fitz.Rect(72, 144, 240, 172)
        page.add_widget(widget)
        rows = EsignEnvelopeService._pdf_widget_rows(pdf.tobytes(), "document")
        pdf.close()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row.name, "Invoice Amount")
        self.assertEqual(row.tooltip, "Amount due")
        self.assertEqual(row.suggested_field_type, "number")
        self.assertEqual(row.default_value, "12.50")
        self.assertEqual(row.max_length, 12)
        self.assertTrue(row.required)
        for value in (row.x, row.y, row.width, row.height):
            self.assertGreater(value, 0)
            self.assertLessEqual(value, 1)

    def test_pdf_widget_geometry_is_clipped_to_the_visible_page(self) -> None:
        pdf = fitz.open()
        page = pdf.new_page(width=612, height=792)
        widget = fitz.Widget()
        widget.field_name = "Partially clipped"
        widget.field_type = fitz.PDF_WIDGET_TYPE_TEXT
        widget.rect = fitz.Rect(560, 740, 660, 830)
        page.add_widget(widget)

        row = EsignEnvelopeService._pdf_widget_rows(pdf.tobytes(), "document")[0]
        pdf.close()

        self.assertTrue(row.supported)
        self.assertAlmostEqual(row.x + row.width, 1.0)
        self.assertAlmostEqual(row.y + row.height, 1.0)
        self.assertAlmostEqual(row.width, 52 / 612)
        self.assertAlmostEqual(row.height, 52 / 792)

    def test_stored_field_validation_checks_page_and_aggregate_bounds(self) -> None:
        document = types.SimpleNamespace(page_count=2, original_filename="agreement.pdf")
        valid = types.SimpleNamespace(
            page_number=1, pos_x=0.7, pos_y=0.8, width=0.3, height=0.2,
        )
        validate_field_placement(valid, document)

        with self.assertRaisesRegex(EsignError, "beyond 'agreement.pdf'"):
            validate_field_placement(types.SimpleNamespace(**{**valid.__dict__, "page_number": 2}), document)
        with self.assertRaisesRegex(EsignError, "extends beyond"):
            validate_field_placement(types.SimpleNamespace(**{**valid.__dict__, "pos_x": 0.8}), document)


if __name__ == "__main__":
    unittest.main()
