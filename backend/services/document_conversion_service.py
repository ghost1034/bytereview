import os
import asyncio
import logging
import shutil
import tempfile
import mimetypes
from typing import Tuple, Optional

logger = logging.getLogger(__name__)

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
CSV_MIME = "text/csv"

OFFICE_PDF_CONVERSION_MIME_TYPES = {DOCX_MIME, PPTX_MIME, XLSX_MIME}
SUPPORTED_EXTRACTION_MIME_TYPES = {
    PDF_MIME,
    DOCX_MIME,
    PPTX_MIME,
    XLSX_MIME,
    CSV_MIME,
    "application/zip",
    "application/x-zip-compressed",
}


def guess_mime_type(filename: Optional[str], fallback: str = "application/octet-stream") -> str:
    guessed, _ = mimetypes.guess_type(filename or "")
    return (guessed or fallback).lower()


def normalize_source_mime_type(filename: Optional[str], mime_type: Optional[str]) -> str:
    lowered = (mime_type or "").lower()
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return PDF_MIME
    if name.endswith(".docx"):
        return DOCX_MIME
    if name.endswith(".pptx"):
        return PPTX_MIME
    if name.endswith(".xlsx"):
        return XLSX_MIME
    if name.endswith(".csv"):
        return CSV_MIME
    if name.endswith(".zip"):
        return "application/zip"
    if lowered and lowered != "application/octet-stream":
        return lowered
    return guess_mime_type(filename, fallback="application/octet-stream")

class DocumentConversionService:
    def __init__(self):
        self.enabled = os.getenv("DOCX_CONVERSION_ENABLED", "true").lower() != "false"
        self.soffice_binary = os.getenv("SOFFICE_BINARY", "soffice").strip() or "soffice"
        try:
            self.timeout = int(os.getenv("DOCX_CONVERSION_TIMEOUT", "120"))
        except Exception:
            self.timeout = 120

    def is_docx(self, filename: Optional[str], mime_type: Optional[str]) -> bool:
        return normalize_source_mime_type(filename, mime_type) == DOCX_MIME

    def is_pptx(self, filename: Optional[str], mime_type: Optional[str]) -> bool:
        return normalize_source_mime_type(filename, mime_type) == PPTX_MIME

    def is_xlsx(self, filename: Optional[str], mime_type: Optional[str]) -> bool:
        return normalize_source_mime_type(filename, mime_type) == XLSX_MIME

    def is_office_pdf_convertible(self, filename: Optional[str], mime_type: Optional[str]) -> bool:
        return normalize_source_mime_type(filename, mime_type) in OFFICE_PDF_CONVERSION_MIME_TYPES

    async def convert_office_local_to_pdf_local(self, input_path: str, out_dir: Optional[str] = None) -> str:
        """
        Convert a local Office file to a local PDF using headless LibreOffice.
        If out_dir is provided, the PDF will be written there. Otherwise, a temporary
        directory will be created for output.
        Returns the path to the generated PDF.
        """
        if not self.enabled:
            raise RuntimeError("Office document conversion is disabled by configuration")

        if not os.path.exists(input_path):
            raise FileNotFoundError(f"Input Office document not found: {input_path}")

        extension = os.path.splitext(input_path)[1].lower()
        if extension not in {".docx", ".pptx", ".xlsx"}:
            raise ValueError(f"Unsupported Office document for PDF conversion: {extension or 'unknown'}")

        soffice_path = shutil.which(self.soffice_binary)
        if not soffice_path:
            raise RuntimeError(
                f"LibreOffice/soffice is not installed in this runtime (expected binary: {self.soffice_binary})"
            )

        created_tmp = False
        if out_dir is None:
            # Create a temporary output directory if none provided
            out_parent = tempfile.mkdtemp(prefix="docx_to_pdf_")
            out_dir = os.path.join(out_parent, "out")
            os.makedirs(out_dir, exist_ok=True)
            created_tmp = True
        else:
            os.makedirs(out_dir, exist_ok=True)

        # Run soffice headless conversion
        cmd = [
            soffice_path,
            "--headless",
            "--convert-to", "pdf",
            "--outdir", out_dir,
            input_path,
        ]
        logger.info(f"Running LibreOffice conversion: {' '.join(cmd)}")
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=self.timeout)
        except asyncio.TimeoutError:
            proc.kill()
            # Clean up created temp dir on timeout
            if created_tmp:
                try:
                    shutil.rmtree(os.path.dirname(out_dir), ignore_errors=True)
                except Exception:
                    logger.warning(f"Failed to cleanup temp dir {os.path.dirname(out_dir)} after timeout")
            raise TimeoutError(f"LibreOffice conversion timed out after {self.timeout}s for {input_path}")

        if proc.returncode != 0:
            logger.error(
                f"LibreOffice conversion failed (code {proc.returncode}). stdout={stdout.decode(errors='ignore')}, stderr={stderr.decode(errors='ignore')}"
            )
            # Clean up created temp dir on failure
            if created_tmp:
                try:
                    shutil.rmtree(os.path.dirname(out_dir), ignore_errors=True)
                except Exception:
                    logger.warning(f"Failed to cleanup temp dir {os.path.dirname(out_dir)} after failure")
            raise RuntimeError("LibreOffice conversion failed")

        # Determine output PDF path
        base = os.path.splitext(os.path.basename(input_path))[0]
        pdf_path = os.path.join(out_dir, base + ".pdf")
        if not os.path.exists(pdf_path) or os.path.getsize(pdf_path) == 0:
            if created_tmp:
                try:
                    shutil.rmtree(os.path.dirname(out_dir), ignore_errors=True)
                except Exception:
                    logger.warning(f"Failed to cleanup temp dir {os.path.dirname(out_dir)} after empty output")
            raise RuntimeError("Expected PDF not produced or empty")

        # If we created a temp output dir, we should not leak it; callers that didn't
        # provide out_dir can't rely on this file path. Since our current code paths
        # always pass out_dir (convert_docx_gcs_to_pdf_gcs), this branch shouldn't be hit.
        # For safety, leave the file in place and log a warning for potential cleanup.
        if created_tmp:
            logger.warning(
                "convert_docx_local_to_pdf_local was called without out_dir; a temporary directory was created."
            )
        return pdf_path

    async def convert_docx_local_to_pdf_local(self, docx_path: str, out_dir: Optional[str] = None) -> str:
        """Convert a local DOCX file to a local PDF using headless LibreOffice."""
        return await self.convert_office_local_to_pdf_local(docx_path, out_dir=out_dir)

    async def convert_pptx_local_to_pdf_local(self, pptx_path: str, out_dir: Optional[str] = None) -> str:
        """Convert a local PPTX file to a local PDF using headless LibreOffice."""
        return await self.convert_office_local_to_pdf_local(pptx_path, out_dir=out_dir)

    async def convert_xlsx_local_to_pdf_local(self, xlsx_path: str, out_dir: Optional[str] = None) -> str:
        """Convert a local XLSX file to a local PDF using headless LibreOffice."""
        return await self.convert_office_local_to_pdf_local(xlsx_path, out_dir=out_dir)

    async def convert_docx_gcs_to_pdf_gcs(self, storage_service, gcs_input_object_name: str, gcs_output_object_name: str) -> Tuple[str, int]:
        """
        Download DOCX from GCS, convert to PDF locally, then upload PDF to GCS.
        Returns (gcs_output_object_name, size_bytes)
        """
        temp_dir = tempfile.mkdtemp(prefix="docx_conv_")
        try:
            local_docx = os.path.join(temp_dir, "input.docx")
            local_pdf = None

            # Download source DOCX
            await storage_service.download_file(gcs_input_object_name, local_docx)

            # Convert to PDF (use the same temp_dir as output to simplify cleanup)
            local_pdf = await self.convert_docx_local_to_pdf_local(local_docx, out_dir=temp_dir)

            # Upload to destination
            await storage_service.upload_file(local_pdf, gcs_output_object_name)

            size_bytes = os.path.getsize(local_pdf)
            return gcs_output_object_name, size_bytes
        finally:
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                logger.warning(f"Failed to cleanup temp dir {temp_dir}")

    async def convert_pptx_gcs_to_pdf_gcs(self, storage_service, gcs_input_object_name: str, gcs_output_object_name: str) -> Tuple[str, int]:
        """
        Download PPTX from GCS, convert to PDF locally, then upload PDF to GCS.
        Returns (gcs_output_object_name, size_bytes)
        """
        temp_dir = tempfile.mkdtemp(prefix="pptx_conv_")
        try:
            local_pptx = os.path.join(temp_dir, "input.pptx")
            await storage_service.download_file(gcs_input_object_name, local_pptx)
            local_pdf = await self.convert_pptx_local_to_pdf_local(local_pptx, out_dir=temp_dir)
            await storage_service.upload_file(local_pdf, gcs_output_object_name)
            size_bytes = os.path.getsize(local_pdf)
            return gcs_output_object_name, size_bytes
        finally:
            try:
                shutil.rmtree(temp_dir)
            except Exception:
                logger.warning(f"Failed to cleanup temp dir {temp_dir}")

# Singleton accessor
_conversion_service: Optional[DocumentConversionService] = None

def get_document_conversion_service() -> DocumentConversionService:
    global _conversion_service
    if _conversion_service is None:
        _conversion_service = DocumentConversionService()
    return _conversion_service
