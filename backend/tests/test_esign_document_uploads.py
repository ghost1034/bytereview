from __future__ import annotations

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch

import fitz
import pytest

from services.esign.envelope_service import EsignError, _prepare_esign_document


def _pdf_bytes(page_count: int = 1) -> bytes:
    document = fitz.open()
    try:
        for _ in range(page_count):
            document.new_page()
        return document.tobytes()
    finally:
        document.close()


def test_pdf_upload_is_kept_as_the_canonical_document() -> None:
    content = _pdf_bytes(2)

    filename, canonical, page_count = asyncio.run(
        _prepare_esign_document("engagement.pdf", content)
    )

    assert filename == "engagement.pdf"
    assert canonical == content
    assert page_count == 2


def test_docx_upload_is_converted_to_a_canonical_pdf() -> None:
    converted_pdf = _pdf_bytes(3)

    async def convert(input_path: str, out_dir: str | None = None) -> str:
        assert input_path.endswith(".docx")
        with open(input_path, "rb") as handle:
            assert handle.read() == b"word document"
        assert out_dir is not None
        os.makedirs(out_dir, exist_ok=True)
        output_path = os.path.join(out_dir, "input.pdf")
        with open(output_path, "wb") as handle:
            handle.write(converted_pdf)
        return output_path

    converter = MagicMock()
    converter.convert_docx_local_to_pdf_local = AsyncMock(side_effect=convert)
    with patch(
        "services.esign.envelope_service.get_document_conversion_service",
        return_value=converter,
    ):
        filename, canonical, page_count = asyncio.run(
            _prepare_esign_document("Client Engagement.DOCX", b"word document")
        )

    assert filename == "Client Engagement.pdf"
    assert canonical == converted_pdf
    assert page_count == 3
    converter.convert_docx_local_to_pdf_local.assert_awaited_once()


def test_non_pdf_or_docx_upload_is_rejected() -> None:
    with pytest.raises(EsignError, match=r"must be a PDF or Word \(\.docx\) document"):
        asyncio.run(_prepare_esign_document("notes.txt", b"plain text"))


def test_docx_conversion_failure_is_reported_as_an_upload_error() -> None:
    converter = MagicMock()
    converter.convert_docx_local_to_pdf_local = AsyncMock(
        side_effect=RuntimeError("LibreOffice is unavailable")
    )
    with patch(
        "services.esign.envelope_service.get_document_conversion_service",
        return_value=converter,
    ):
        with pytest.raises(EsignError, match="could not be converted to PDF"):
            asyncio.run(_prepare_esign_document("engagement.docx", b"word document"))
