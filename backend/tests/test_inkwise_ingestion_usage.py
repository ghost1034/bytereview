from __future__ import annotations

import unittest
from types import SimpleNamespace
from inkwise.services.ingestion_service import InkwiseIngestionService

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
    def test_documents_wait_for_provider_tokens(self) -> None:
        service = InkwiseIngestionService()

        measurement = service._build_usage_measurement(
            normalized=SimpleNamespace(source_kind="pdf", page_count=12),
            embedded_media_tokens=None,
        )

        self.assertEqual(measurement.basis, "provider_tokens")
        self.assertEqual(measurement.billable_pages, 0)
        self.assertIsNone(measurement.usage_tokens)

    def test_images_do_not_create_page_charges(self) -> None:
        service = InkwiseIngestionService()

        measurement = service._build_usage_measurement(
            normalized=SimpleNamespace(source_kind="image", page_count=1),
            embedded_media_tokens=None,
        )

        self.assertEqual(measurement.basis, "provider_tokens")
        self.assertEqual(measurement.billable_pages, 0)

    def test_embedding_tokens_are_not_converted_to_pages(self) -> None:
        service = InkwiseIngestionService()

        measurement = service._build_usage_measurement(
            normalized=SimpleNamespace(source_kind="audio", page_count=0),
            embedded_media_tokens=1401,
        )

        self.assertEqual(measurement.basis, "provider_tokens")
        self.assertEqual(measurement.billable_pages, 0)
        self.assertEqual(measurement.usage_tokens, 1401)
        self.assertIsNone(measurement.usage_tokens_per_page)

    def test_missing_embedding_usage_is_not_estimated(self) -> None:
        service = InkwiseIngestionService()
        measurement = service._build_usage_measurement(
            normalized=SimpleNamespace(source_kind="video", page_count=0),
            embedded_media_tokens=0,
        )
        self.assertEqual(measurement.usage_tokens, 0)
        self.assertEqual(measurement.billable_pages, 0)

    def test_embedding_usage_prefers_provider_total(self) -> None:
        service = InkwiseIngestionService()
        embedding_result = SimpleNamespace(usage=SimpleNamespace(prompt_token_count=91, total_token_count=120))

        self.assertEqual(service._extract_embedding_usage_tokens(embedding_result), 120)

    def test_embedding_usage_falls_back_to_prompt_tokens(self) -> None:
        service = InkwiseIngestionService()
        embedding_result = SimpleNamespace(usage=SimpleNamespace(prompt_token_count=91, total_token_count=0))

        self.assertEqual(service._extract_embedding_usage_tokens(embedding_result), 91)


if __name__ == "__main__":
    unittest.main()
