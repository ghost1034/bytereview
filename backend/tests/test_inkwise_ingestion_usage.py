from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

from inkwise.services.ingestion_service import IngestionError, InkwiseIngestionService

_PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class InkwiseIngestionSupportedSourceTests(unittest.TestCase):
    def test_office_documents_supported_by_content_type(self) -> None:
        service = InkwiseIngestionService()
        pptx = SimpleNamespace(content_type=_PPTX_MIME, original_filename="deck.bin")
        xlsx = SimpleNamespace(content_type=_XLSX_MIME, original_filename="book.bin")
        self.assertTrue(service._is_supported_source(pptx))
        self.assertTrue(service._is_supported_source(xlsx))

    def test_office_documents_supported_by_filename(self) -> None:
        service = InkwiseIngestionService()
        pptx = SimpleNamespace(content_type="application/octet-stream", original_filename="deck.pptx")
        xlsx = SimpleNamespace(content_type="application/octet-stream", original_filename="book.xlsx")
        self.assertTrue(service._is_supported_source(pptx))
        self.assertTrue(service._is_supported_source(xlsx))


class InkwiseIngestionUsageTests(unittest.TestCase):
    def test_documents_meter_by_page_count(self) -> None:
        service = InkwiseIngestionService()

        measurement = service._build_usage_measurement(
            normalized=SimpleNamespace(source_kind="pdf", page_count=12),
            embedded_media_tokens=None,
        )

        self.assertEqual(measurement.basis, "page_count")
        self.assertEqual(measurement.billable_pages, 12)
        self.assertIsNone(measurement.usage_tokens)

    def test_images_meter_as_one_page(self) -> None:
        service = InkwiseIngestionService()

        measurement = service._build_usage_measurement(
            normalized=SimpleNamespace(source_kind="image", page_count=1),
            embedded_media_tokens=None,
        )

        self.assertEqual(measurement.basis, "single_page_image")
        self.assertEqual(measurement.billable_pages, 1)

    def test_media_tokens_convert_to_billable_pages(self) -> None:
        service = InkwiseIngestionService()

        with patch("inkwise.services.ingestion_service.get_inkwise_settings", return_value=SimpleNamespace(media_tokens_per_page=700)):
            measurement = service._build_usage_measurement(
                normalized=SimpleNamespace(source_kind="audio", page_count=0),
                embedded_media_tokens=1401,
            )

        self.assertEqual(measurement.basis, "media_tokens")
        self.assertEqual(measurement.billable_pages, 3)
        self.assertEqual(measurement.usage_tokens, 1401)
        self.assertEqual(measurement.usage_tokens_per_page, 700)

    def test_media_usage_requires_tokens_after_embedding(self) -> None:
        service = InkwiseIngestionService()

        with patch("inkwise.services.ingestion_service.get_inkwise_settings", return_value=SimpleNamespace(media_tokens_per_page=700)):
            with self.assertRaises(IngestionError):
                service._build_usage_measurement(
                    normalized=SimpleNamespace(source_kind="video", page_count=0),
                    embedded_media_tokens=0,
                )

    def test_embedding_usage_prefers_prompt_tokens(self) -> None:
        service = InkwiseIngestionService()
        embedding_result = SimpleNamespace(usage=SimpleNamespace(prompt_token_count=91, total_token_count=120))

        self.assertEqual(service._extract_embedding_usage_tokens(embedding_result), 91)

    def test_embedding_usage_falls_back_to_total_tokens(self) -> None:
        service = InkwiseIngestionService()
        embedding_result = SimpleNamespace(usage=SimpleNamespace(prompt_token_count=0, total_token_count=120))

        self.assertEqual(service._extract_embedding_usage_tokens(embedding_result), 120)


if __name__ == "__main__":
    unittest.main()
