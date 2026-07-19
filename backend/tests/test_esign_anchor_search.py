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


if __name__ == "__main__":
    unittest.main()
