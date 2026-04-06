from __future__ import annotations

import asyncio
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

from inkwise.services.source_normalizer import InkwiseSourceNormalizer, SourceNormalizationError
from services.document_conversion_service import DocumentConversionService


class DocumentConversionServiceTests(unittest.TestCase):
    def test_raises_clear_error_when_soffice_missing(self) -> None:
        service = DocumentConversionService()

        with tempfile.NamedTemporaryFile(suffix=".docx") as handle:
            with patch("services.document_conversion_service.shutil.which", return_value=None):
                with self.assertRaisesRegex(
                    RuntimeError,
                    "LibreOffice/soffice is not installed in this runtime",
                ):
                    asyncio.run(service.convert_docx_local_to_pdf_local(handle.name))


class InkwiseSourceNormalizerTests(unittest.TestCase):
    def test_wraps_missing_soffice_error_for_docx_sources(self) -> None:
        normalizer = InkwiseSourceNormalizer()
        converter = type("ConverterStub", (), {})()
        converter.convert_docx_local_to_pdf_local = AsyncMock(
            side_effect=RuntimeError("LibreOffice/soffice is not installed in this runtime (expected binary: soffice)")
        )

        with patch("inkwise.services.source_normalizer.get_document_conversion_service", return_value=converter):
            with self.assertRaisesRegex(
                SourceNormalizationError,
                "DOCX conversion failed: LibreOffice/soffice is not installed in this runtime",
            ):
                normalizer._normalize_docx(local_path="/tmp/example.docx", title="Example")


if __name__ == "__main__":
    unittest.main()
