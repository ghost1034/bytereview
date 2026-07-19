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

from services.esign.envelope_service import EsignEnvelopeService


class AnchorSearchTests(unittest.IsolatedAsyncioTestCase):
    async def test_rotated_page_returns_display_fraction_coordinates(self) -> None:
        pdf = fitz.open()
        page = pdf.new_page(width=612, height=792)
        page.insert_text((72, 144), "CLIENT_SIGNATURE_ANCHOR")
        page.set_rotation(90)
        content = pdf.tobytes()
        pdf.close()

        blob = types.SimpleNamespace(download_as_bytes=lambda: content)
        bucket = types.SimpleNamespace(blob=lambda _name: blob)
        service = EsignEnvelopeService.__new__(EsignEnvelopeService)
        service.storage = types.SimpleNamespace(bucket=bucket)
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


if __name__ == "__main__":
    unittest.main()
