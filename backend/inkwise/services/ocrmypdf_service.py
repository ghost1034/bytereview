"""OCRmyPDF helpers for Inkwise document ingestion."""

from __future__ import annotations

import os
import shutil
import subprocess


class OCRmyPDFError(RuntimeError):
    pass


class OCRmyPDFService:
    def run_ocr(
        self,
        *,
        input_pdf_path: str,
        output_pdf_path: str,
        languages: str,
        timeout_seconds: int,
        force_ocr: bool = False,
    ) -> str:
        executable = shutil.which("ocrmypdf")
        if not executable:
            raise OCRmyPDFError("ocrmypdf is not installed in the ingestion runtime")

        input_path = os.path.abspath(input_pdf_path)
        output_path = os.path.abspath(output_pdf_path)
        if not os.path.exists(input_path):
            raise OCRmyPDFError(f"Input PDF does not exist: {input_path}")

        command = [
            executable,
            "--language",
            (languages or "eng").strip() or "eng",
            "--output-type",
            "pdf",
            "--optimize",
            "0",
        ]
        command.append("--force-ocr" if force_ocr else "--skip-text")
        command.extend([input_path, output_path])

        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=max(1, int(timeout_seconds)),
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise OCRmyPDFError("ocrmypdf timed out during document OCR") from exc
        except OSError as exc:
            raise OCRmyPDFError(f"ocrmypdf could not be started: {exc}") from exc

        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "ocrmypdf failed").strip()
            raise OCRmyPDFError(detail[:2000])
        if not os.path.exists(output_path):
            raise OCRmyPDFError("ocrmypdf completed without producing an output PDF")
        return output_path
