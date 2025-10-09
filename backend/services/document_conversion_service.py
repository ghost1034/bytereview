import os
import asyncio
import logging
import shutil
import tempfile
import subprocess
from typing import Tuple, Optional

logger = logging.getLogger(__name__)

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

class DocumentConversionService:
    def __init__(self):
        self.enabled = os.getenv("DOCX_CONVERSION_ENABLED", "true").lower() != "false"
        try:
            self.timeout = int(os.getenv("DOCX_CONVERSION_TIMEOUT", "120"))
        except Exception:
            self.timeout = 120

    def is_docx(self, filename: Optional[str], mime_type: Optional[str]) -> bool:
        if (mime_type or "").lower() == DOCX_MIME:
            return True
        if filename and filename.lower().endswith(".docx"):
            return True
        return False

    async def convert_docx_local_to_pdf_local(self, docx_path: str, out_dir: Optional[str] = None) -> str:
        """
        Convert a local DOCX file to a local PDF using headless LibreOffice.
        If out_dir is provided, the PDF will be written there. Otherwise, a temporary
        directory will be created for output.
        Returns the path to the generated PDF.
        """
        if not self.enabled:
            raise RuntimeError("DOCX conversion is disabled by configuration")

        if not os.path.exists(docx_path):
            raise FileNotFoundError(f"Input DOCX not found: {docx_path}")

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
            "soffice",
            "--headless",
            "--convert-to", "pdf",
            "--outdir", out_dir,
            docx_path,
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
            raise TimeoutError(f"LibreOffice conversion timed out after {self.timeout}s for {docx_path}")

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
        base = os.path.splitext(os.path.basename(docx_path))[0]
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

# Singleton accessor
_conversion_service: Optional[DocumentConversionService] = None

def get_document_conversion_service() -> DocumentConversionService:
    global _conversion_service
    if _conversion_service is None:
        _conversion_service = DocumentConversionService()
    return _conversion_service
