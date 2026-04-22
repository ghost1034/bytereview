"""Backend service for the Form Fill feature."""

from __future__ import annotations

import csv
import json
import logging
import mimetypes
import os
import re
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import fitz
from google import genai
from google.genai import types
from openpyxl import load_workbook
from sqlalchemy.orm import Session

from core.database import db_config
from models.db_models import (
    ExtractionJob,
    ExtractionResult,
    ExtractionTask,
    FormFillRun,
    FormFillTemplate,
    JobRun,
    SourceFile,
    SourceFileToTask,
)
from models.form_fill import (
    FormFillExtractionSourcePreviewResponse,
    FormFillRunResponse,
    FormFillTemplateResponse,
)
from services.cloud_run_task_service import cloud_run_task_service
from services.document_conversion_service import DOCX_MIME, get_document_conversion_service
from services.gcs_service import get_storage_service


logger = logging.getLogger(__name__)

PDF_MIME = "application/pdf"
DOCX_PLACEHOLDER_RE = re.compile(r"(\{\{[^{}]+\}\}|\[\[[^\[\]]+\]\]|<<[^<>]+>>)")
DOCX_BLOCK_TEXT_LIMIT = 30000
SUPPORTED_SOURCE_MIME_TYPES = {
    "application/pdf",
    DOCX_MIME,
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
SUPPORTED_TARGET_MIME_TYPES = {PDF_MIME, DOCX_MIME}


def _guess_mime_type(filename: str, fallback: str = "application/octet-stream") -> str:
    guessed, _ = mimetypes.guess_type(filename or "")
    return guessed or fallback


def _safe_ext(filename: str, fallback: str) -> str:
    ext = Path(filename or "").suffix.lower()
    return ext or fallback


def _normalize_output_format(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    lowered = value.strip().lower()
    return lowered or None


class FormFillService:
    def __init__(self) -> None:
        self.storage_service = get_storage_service()
        self.max_spreadsheet_rows = int(os.getenv("FORM_FILL_MAX_SPREADSHEET_ROWS", "200"))
        self.max_sheet_chars = int(os.getenv("FORM_FILL_MAX_SHEET_CHARS", "30000"))

        project = os.getenv("GOOGLE_CLOUD_PROJECT_ID")
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
        self.model_name = os.getenv("FORM_FILL_GEMINI_MODEL", "gemini-3.1-pro-preview")
        self.client = None
        if project:
            try:
                self.client = genai.Client(vertexai=True, project=project, location=location)
            except Exception as exc:
                logger.error("Failed to initialize Form Fill Vertex AI client: %s", exc)

    def _get_session(self) -> Session:
        return db_config.get_session()

    def _serialize_template(self, template: FormFillTemplate) -> FormFillTemplateResponse:
        return FormFillTemplateResponse(
            id=str(template.id),
            name=template.name,
            description=template.description,
            original_filename=template.original_filename,
            file_type=template.file_type,
            file_size_bytes=int(template.file_size_bytes or 0),
            created_at=template.created_at,
            updated_at=template.updated_at,
        )

    def _serialize_run(self, run: FormFillRun) -> FormFillRunResponse:
        warnings = run.warnings if isinstance(run.warnings, list) else []
        source_payload = run.source_payload if isinstance(run.source_payload, dict) else None
        fill_plan = run.fill_plan if isinstance(run.fill_plan, dict) else None
        return FormFillRunResponse(
            id=str(run.id),
            status=run.status,
            source_mode=run.source_mode,
            source_filename=run.source_filename,
            source_file_type=run.source_file_type,
            source_payload=source_payload,
            source_job_id=str(run.source_job_id) if run.source_job_id else None,
            source_run_id=str(run.source_run_id) if run.source_run_id else None,
            source_task_id=str(run.source_task_id) if run.source_task_id else None,
            target_mode=run.target_mode,
            target_template_id=str(run.target_template_id) if run.target_template_id else None,
            target_filename=run.target_filename,
            target_file_type=run.target_file_type,
            output_format=run.output_format,
            processing_strategy=run.processing_strategy,
            warnings=warnings,
            fill_plan=fill_plan,
            result_filename=run.result_filename,
            result_file_type=run.result_file_type,
            error_message=run.error_message,
            created_at=run.created_at,
            updated_at=run.updated_at,
            completed_at=run.completed_at,
        )

    def list_templates(self, user_id: str) -> list[FormFillTemplateResponse]:
        db = self._get_session()
        try:
            templates = db.query(FormFillTemplate).filter(FormFillTemplate.user_id == user_id).order_by(
                FormFillTemplate.updated_at.desc(), FormFillTemplate.created_at.desc()
            ).all()
            return [self._serialize_template(item) for item in templates]
        finally:
            db.close()

    def delete_template(self, user_id: str, template_id: str) -> None:
        db = self._get_session()
        try:
            template = db.query(FormFillTemplate).filter(
                FormFillTemplate.id == uuid.UUID(str(template_id)),
                FormFillTemplate.user_id == user_id,
            ).first()
            if not template:
                raise ValueError("Form Fill template not found")

            db.delete(template)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def _load_extraction_source_payload(
        self,
        db: Session,
        *,
        user_id: str,
        job_id: str,
        run_id: str,
        task_id: str,
    ) -> dict[str, Any]:
        task = db.query(ExtractionTask).join(JobRun, JobRun.id == ExtractionTask.job_run_id).join(
            ExtractionJob, ExtractionJob.id == JobRun.job_id
        ).filter(
            ExtractionTask.id == uuid.UUID(str(task_id)),
            JobRun.id == uuid.UUID(str(run_id)),
            ExtractionJob.id == uuid.UUID(str(job_id)),
            ExtractionJob.user_id == user_id,
        ).first()
        if not task:
            raise ValueError("Selected extraction result not found")

        result = db.query(ExtractionResult).filter(ExtractionResult.task_id == task.id).first()
        if not result or not isinstance(result.extracted_data, dict):
            raise ValueError("Selected extraction result has no saved rows")

        extracted_data = result.extracted_data
        columns = extracted_data.get("columns") or []
        rows = extracted_data.get("results") or []
        if not isinstance(columns, list) or not isinstance(rows, list):
            raise ValueError("Selected extraction result is malformed")

        task_source_files = db.query(SourceFile.original_path).join(
            SourceFileToTask, SourceFile.id == SourceFileToTask.source_file_id
        ).filter(SourceFileToTask.task_id == task.id).order_by(SourceFile.original_path.asc()).all()
        source_files = [item[0] for item in task_source_files]

        return {
            "kind": "extraction_result",
            "columns": columns,
            "rows": rows,
            "source_files": source_files,
            "job_id": str(job_id),
            "run_id": str(run_id),
            "task_id": str(task_id),
        }

    def get_extraction_source_preview(
        self,
        user_id: str,
        *,
        job_id: str,
        run_id: str,
        task_id: str,
    ) -> FormFillExtractionSourcePreviewResponse:
        db = self._get_session()
        try:
            payload = self._load_extraction_source_payload(
                db,
                user_id=user_id,
                job_id=job_id,
                run_id=run_id,
                task_id=task_id,
            )
            return FormFillExtractionSourcePreviewResponse(
                job_id=job_id,
                run_id=run_id,
                task_id=task_id,
                source_files=list(payload.get("source_files") or []),
                columns=list(payload.get("columns") or []),
                rows=list(payload.get("rows") or []),
            )
        finally:
            db.close()

    async def _upload_bytes(self, object_name: str, content: bytes) -> None:
        if not hasattr(self.storage_service, "upload_file_content"):
            raise RuntimeError("Form Fill requires Google Cloud Storage")
        await self.storage_service.upload_file_content(content, object_name)

    async def _download_to_local(self, object_name: str, local_path: str) -> None:
        if not hasattr(self.storage_service, "download_file"):
            raise RuntimeError("Form Fill requires Google Cloud Storage")
        await self.storage_service.download_file(object_name, local_path)

    async def create_run(
        self,
        *,
        user_id: str,
        source_file: Any = None,
        target_file: Any = None,
        template_id: Optional[str] = None,
        output_format: Optional[str] = None,
        save_template_name: Optional[str] = None,
        save_template_description: Optional[str] = None,
        source_job_id: Optional[str] = None,
        source_run_id: Optional[str] = None,
        source_task_id: Optional[str] = None,
    ) -> FormFillRunResponse:
        db = self._get_session()
        try:
            source_from_extraction = bool(source_job_id and source_run_id and source_task_id)
            if bool(source_file) == source_from_extraction:
                raise ValueError("Provide either a source file or an extraction result source")
            if bool(target_file) == bool(template_id):
                raise ValueError("Provide either a target file or a saved template")

            run = FormFillRun(
                user_id=user_id,
                status="pending",
                source_mode="upload" if source_file else "extraction_result",
                target_mode="upload" if target_file else "template",
                target_filename="pending",
                target_file_type="application/octet-stream",
                target_gcs_object_name="pending",
                target_file_size_bytes=0,
                output_format="pending",
            )
            db.add(run)
            db.flush()

            if source_file:
                source_bytes = await source_file.read()
                if not source_bytes:
                    raise ValueError("Source file is empty")

                source_filename = source_file.filename or "source"
                source_mime = (source_file.content_type or _guess_mime_type(source_filename)).lower()
                if source_mime not in SUPPORTED_SOURCE_MIME_TYPES:
                    raise ValueError("Unsupported source file type")

                source_object_name = f"form-fill/{user_id}/runs/{run.id}/source{_safe_ext(source_filename, '.bin')}"
                await self._upload_bytes(source_object_name, source_bytes)
                run.source_filename = source_filename
                run.source_file_type = source_mime
                run.source_gcs_object_name = source_object_name
                run.source_file_size_bytes = len(source_bytes)
            else:
                payload = self._load_extraction_source_payload(
                    db,
                    user_id=user_id,
                    job_id=str(source_job_id),
                    run_id=str(source_run_id),
                    task_id=str(source_task_id),
                )
                run.source_filename = "Extraction Results"
                run.source_file_type = "application/json"
                run.source_payload = payload
                run.source_job_id = uuid.UUID(str(source_job_id))
                run.source_run_id = uuid.UUID(str(source_run_id))
                run.source_task_id = uuid.UUID(str(source_task_id))

            if target_file:
                target_bytes = await target_file.read()
                if not target_bytes:
                    raise ValueError("Target file is empty")

                target_filename = target_file.filename or "target"
                target_mime = (target_file.content_type or _guess_mime_type(target_filename)).lower()
                if target_mime not in SUPPORTED_TARGET_MIME_TYPES:
                    raise ValueError("Target file must be a PDF or DOCX")

                target_object_name = f"form-fill/{user_id}/runs/{run.id}/target{_safe_ext(target_filename, '.bin')}"
                await self._upload_bytes(target_object_name, target_bytes)

                run.target_filename = target_filename
                run.target_file_type = target_mime
                run.target_gcs_object_name = target_object_name
                run.target_file_size_bytes = len(target_bytes)

                if save_template_name and save_template_name.strip():
                    template = FormFillTemplate(
                        user_id=user_id,
                        name=save_template_name.strip(),
                        description=(save_template_description or "").strip() or None,
                        original_filename=target_filename,
                        file_type=target_mime,
                        gcs_object_name=f"form-fill/{user_id}/templates/{uuid.uuid4()}/target{_safe_ext(target_filename, '.bin')}",
                        file_size_bytes=len(target_bytes),
                    )
                    await self._upload_bytes(template.gcs_object_name, target_bytes)
                    db.add(template)
                    db.flush()
            else:
                template = db.query(FormFillTemplate).filter(
                    FormFillTemplate.id == uuid.UUID(str(template_id)),
                    FormFillTemplate.user_id == user_id,
                ).first()
                if not template:
                    raise ValueError("Form Fill template not found")

                run.target_template_id = template.id
                run.target_filename = template.original_filename
                run.target_file_type = template.file_type
                run.target_gcs_object_name = template.gcs_object_name
                run.target_file_size_bytes = template.file_size_bytes

            normalized_output_format = _normalize_output_format(output_format)
            target_default_format = "docx" if run.target_file_type == DOCX_MIME else "pdf"
            if normalized_output_format is None:
                normalized_output_format = target_default_format

            if run.target_file_type == PDF_MIME and normalized_output_format != "pdf":
                raise ValueError("PDF targets currently output PDF only")
            if run.target_file_type == DOCX_MIME and normalized_output_format not in {"docx", "pdf"}:
                raise ValueError("DOCX targets must output DOCX or PDF")

            run.output_format = normalized_output_format
            db.commit()
            db.refresh(run)

            await cloud_run_task_service.enqueue_form_fill_task(str(run.id))
            return self._serialize_run(run)
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def get_run(self, user_id: str, run_id: str) -> FormFillRunResponse:
        db = self._get_session()
        try:
            run = db.query(FormFillRun).filter(
                FormFillRun.id == uuid.UUID(str(run_id)),
                FormFillRun.user_id == user_id,
            ).first()
            if not run:
                raise ValueError("Form Fill run not found")
            return self._serialize_run(run)
        finally:
            db.close()

    def get_run_result_metadata(self, user_id: str, run_id: str) -> FormFillRun:
        db = self._get_session()
        try:
            run = db.query(FormFillRun).filter(
                FormFillRun.id == uuid.UUID(str(run_id)),
                FormFillRun.user_id == user_id,
            ).first()
            if not run:
                raise ValueError("Form Fill run not found")
            if run.status != "completed" or not run.result_gcs_object_name or not run.result_filename:
                raise ValueError("Form Fill output is not ready")
            db.expunge(run)
            return run
        finally:
            db.close()

    def _part_from_uri(self, uri: str, mime_type: str) -> Any:
        return types.Part.from_uri(file_uri=uri, mime_type=mime_type)

    def _parse_response_payload(self, response: Any) -> dict[str, Any]:
        parsed = getattr(response, "parsed", None)
        if hasattr(parsed, "model_dump"):
            parsed = parsed.model_dump()
        if isinstance(parsed, dict):
            return parsed
        text = getattr(response, "text", None)
        if not text:
            raise ValueError("Gemini returned an empty response")
        payload = json.loads(text)
        if not isinstance(payload, dict):
            raise ValueError("Gemini returned an unexpected response")
        return payload

    def _extract_pdf_form_fields(self, local_path: str) -> list[str]:
        from PyPDF2 import PdfReader

        reader = PdfReader(local_path)
        fields = reader.get_fields() or {}
        return [str(name) for name in fields.keys()]

    def _extract_pdf_text(self, local_path: str, max_chars: int = 20000) -> str:
        doc = fitz.open(local_path)
        parts: list[str] = []
        try:
            for page_index, page in enumerate(doc, start=1):
                text = (page.get_text("text") or "").strip()
                if text:
                    parts.append(f"Page {page_index}:\n{text}")
                joined = "\n\n".join(parts)
                if len(joined) >= max_chars:
                    return joined[:max_chars]
        finally:
            doc.close()
        return "\n\n".join(parts)[:max_chars]

    def _extract_docx_text(self, local_path: str, max_chars: int = 20000) -> str:
        from docx import Document as DocxDocument

        doc = DocxDocument(local_path)
        parts: list[str] = []
        for paragraph in doc.paragraphs:
            text = paragraph.text.strip()
            if text:
                parts.append(text)
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if row_text:
                    parts.append(row_text)
        joined = "\n\n".join(parts)
        return joined[:max_chars]

    def _extract_docx_placeholders(self, local_path: str) -> list[str]:
        from docx import Document as DocxDocument

        doc = DocxDocument(local_path)
        found: list[str] = []

        def collect(text: str) -> None:
            for match in DOCX_PLACEHOLDER_RE.findall(text or ""):
                if match not in found:
                    found.append(match)

        for paragraph in doc.paragraphs:
            collect(paragraph.text)
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    collect(cell.text)
        for section in doc.sections:
            for paragraph in section.header.paragraphs:
                collect(paragraph.text)
            for paragraph in section.footer.paragraphs:
                collect(paragraph.text)
        return found

    def _markdown_table(self, columns: list[str], rows: list[list[Any]], max_rows: int) -> str:
        limited_rows = rows[:max_rows]
        safe_columns = [str(col) for col in columns]
        if not safe_columns:
            return ""
        lines = ["| " + " | ".join(safe_columns) + " |", "| " + " | ".join(["---"] * len(safe_columns)) + " |"]
        for row in limited_rows:
            values = []
            for index in range(len(safe_columns)):
                value = row[index] if isinstance(row, list) and index < len(row) else None
                values.append(str(value) if value is not None else "")
            lines.append("| " + " | ".join(values) + " |")
        return "\n".join(lines)

    def _load_csv_text(self, local_path: str) -> str:
        with open(local_path, "r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle)
            rows = list(reader)
        if not rows:
            return ""
        columns = [str(item) for item in rows[0]]
        data_rows = [list(row) for row in rows[1:1 + self.max_spreadsheet_rows]]
        return self._markdown_table(columns, data_rows, self.max_spreadsheet_rows)[: self.max_sheet_chars]

    def _load_xlsx_text(self, local_path: str) -> str:
        workbook = load_workbook(local_path, read_only=True, data_only=True)
        parts: list[str] = []
        try:
            for worksheet in workbook.worksheets:
                rows = list(worksheet.iter_rows(values_only=True, max_row=self.max_spreadsheet_rows + 1))
                if not rows:
                    continue
                columns = [str(item) if item is not None else "" for item in rows[0]]
                data_rows = [list(row) for row in rows[1:1 + self.max_spreadsheet_rows]]
                rendered = self._markdown_table(columns, data_rows, self.max_spreadsheet_rows)
                if rendered:
                    parts.append(f"Sheet: {worksheet.title}\n{rendered}")
                joined = "\n\n".join(parts)
                if len(joined) >= self.max_sheet_chars:
                    return joined[: self.max_sheet_chars]
        finally:
            workbook.close()
        return "\n\n".join(parts)[: self.max_sheet_chars]

    def _ensure_client(self) -> None:
        if not self.client:
            raise RuntimeError("Form Fill AI is not configured")

    def _field_mapping_schema(self) -> types.Schema:
        return types.Schema(
            type="OBJECT",
            properties={
                "items": types.Schema(
                    type="ARRAY",
                    items=types.Schema(
                        type="OBJECT",
                        properties={
                            "name": types.Schema(type="STRING"),
                            "value": types.Schema(type="STRING", nullable=True),
                        },
                        required=["name", "value"],
                    ),
                ),
                "warnings": types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
            },
            required=["items", "warnings"],
        )

    def _document_schema(self) -> types.Schema:
        return types.Schema(
            type="OBJECT",
            properties={
                "title": types.Schema(type="STRING", nullable=True),
                "content": types.Schema(type="STRING"),
                "warnings": types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
            },
            required=["title", "content", "warnings"],
        )

    def _generate_json_response(self, contents: list[Any], schema: types.Schema) -> dict[str, Any]:
        self._ensure_client()
        response = self.client.models.generate_content(
            model=self.model_name,
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=schema,
                temperature=0.1,
                max_output_tokens=65536,
            ),
        )
        return self._parse_response_payload(response)

    async def _build_source_context(
        self,
        *,
        run: FormFillRun,
        source_parts: list[Any],
        source_text_sections: list[str],
    ) -> tuple[list[Any], str]:
        if isinstance(run.source_payload, dict) and run.source_payload.get("kind") == "extraction_result":
            columns = list(run.source_payload.get("columns") or [])
            rows = list(run.source_payload.get("rows") or [])
            source_files = list(run.source_payload.get("source_files") or [])
            source_text_sections.append("Extraction result source files: " + ", ".join(source_files))
            source_text_sections.append(self._markdown_table(columns, rows, self.max_spreadsheet_rows))
            return source_parts, "\n\n".join(item for item in source_text_sections if item)

        if not run.source_gcs_object_name or not run.source_file_type:
            raise ValueError("Form Fill source is missing")

        mime_type = run.source_file_type.lower()
        if mime_type in {PDF_MIME, DOCX_MIME}:
            source_object_name = run.source_gcs_object_name
            part_mime = mime_type
            if mime_type == DOCX_MIME:
                preview_object = f"form-fill/{run.user_id}/runs/{run.id}/source-preview.pdf"
                converter = get_document_conversion_service()
                await converter.convert_docx_gcs_to_pdf_gcs(self.storage_service, source_object_name, preview_object)
                source_object_name = preview_object
                part_mime = PDF_MIME
                source_text_sections.append("The original source file was a DOCX converted to PDF for Gemini input.")
            source_parts.append(self._part_from_uri(self.storage_service.construct_gcs_uri_for_object(source_object_name), part_mime))
            return source_parts, "\n\n".join(item for item in source_text_sections if item)

        with tempfile.TemporaryDirectory(prefix="form_fill_source_") as temp_dir:
            local_path = os.path.join(temp_dir, f"source{_safe_ext(run.source_filename or '', '.bin')}")
            await self._download_to_local(run.source_gcs_object_name, local_path)
            if mime_type in {"text/csv", "application/vnd.ms-excel"}:
                source_text_sections.append(self._load_csv_text(local_path))
            elif mime_type == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                source_text_sections.append(self._load_xlsx_text(local_path))
            else:
                raise ValueError("Unsupported source file type")
        return source_parts, "\n\n".join(item for item in source_text_sections if item)

    def _replace_text_in_paragraph(self, paragraph: Any, replacements: dict[str, str]) -> None:
        text = paragraph.text
        if not text:
            return
        updated = text
        for placeholder, value in replacements.items():
            updated = updated.replace(placeholder, value)
        if updated != text:
            paragraph.text = updated

    def _apply_docx_placeholders(self, local_target_path: str, replacements: dict[str, str], output_path: str) -> None:
        from docx import Document as DocxDocument

        doc = DocxDocument(local_target_path)
        for paragraph in doc.paragraphs:
            self._replace_text_in_paragraph(paragraph, replacements)
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    for paragraph in cell.paragraphs:
                        self._replace_text_in_paragraph(paragraph, replacements)
        for section in doc.sections:
            for paragraph in section.header.paragraphs:
                self._replace_text_in_paragraph(paragraph, replacements)
            for paragraph in section.footer.paragraphs:
                self._replace_text_in_paragraph(paragraph, replacements)
        doc.save(output_path)

    def _apply_fillable_pdf(self, local_target_path: str, field_values: dict[str, str], output_path: str) -> None:
        from PyPDF2 import PdfReader, PdfWriter
        from PyPDF2.generic import BooleanObject, NameObject

        reader = PdfReader(local_target_path)
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)

        for page in writer.pages:
            writer.update_page_form_field_values(page, field_values)

        try:
            if "/AcroForm" in reader.trailer["/Root"]:
                writer._root_object.update({NameObject("/AcroForm"): reader.trailer["/Root"]["/AcroForm"]})
                writer._root_object[NameObject("/AcroForm")].update({NameObject("/NeedAppearances"): BooleanObject(True)})
        except Exception as exc:
            logger.warning("Failed to copy AcroForm metadata: %s", exc)

        with open(output_path, "wb") as handle:
            writer.write(handle)

    def _pdf_overlay_schema(self) -> types.Schema:
        return types.Schema(
            type="OBJECT",
            properties={
                "items": types.Schema(
                    type="ARRAY",
                    items=types.Schema(
                        type="OBJECT",
                        properties={
                            "page_number": types.Schema(type="INTEGER", nullable=True),
                            "anchor_text": types.Schema(type="STRING", nullable=True),
                            "anchor_before": types.Schema(type="STRING", nullable=True),
                            "anchor_after": types.Schema(type="STRING", nullable=True),
                            "overlay_text": types.Schema(type="STRING"),
                            "placement_hint": types.Schema(type="STRING", nullable=True),
                            "cover_anchor": types.Schema(type="BOOLEAN", nullable=True),
                            "font_size": types.Schema(type="NUMBER", nullable=True),
                        },
                        required=["page_number", "overlay_text"],
                    ),
                ),
                "warnings": types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
            },
            required=["items", "warnings"],
        )

    def _docx_edit_schema(self) -> types.Schema:
        return types.Schema(
            type="OBJECT",
            properties={
                "operations": types.Schema(
                    type="ARRAY",
                    items=types.Schema(
                        type="OBJECT",
                        properties={
                            "action": types.Schema(type="STRING"),
                            "block_id": types.Schema(type="STRING"),
                            "find_text": types.Schema(type="STRING", nullable=True),
                            "text": types.Schema(type="STRING", nullable=True),
                        },
                        required=["action", "block_id"],
                    ),
                ),
                "warnings": types.Schema(type="ARRAY", items=types.Schema(type="STRING")),
            },
            required=["operations", "warnings"],
        )

    def _build_pdf_overlay_prompt(self, *, source_text: str, target_preview_text: str) -> str:
        source_block = source_text.strip() or "The source is provided as attached document(s)."
        target_block = target_preview_text.strip() or "No preview text was available from the target PDF."
        return f"""You are filling the provided PDF by overlaying text onto the original pages.

Source material summary:
{source_block}

Target PDF text preview:
{target_block}

Instructions:
- Return overlay items only for content that should be added to the original PDF.
- Use the original page numbers from the target PDF.
- Prefer anchor_text that appears visibly in the PDF near where the overlay should go.
- Use placement_hint values such as replace_anchor, right_of, below, or near_blank.
- Set cover_anchor to true when replacing placeholder text, blanks, or underscores already present in the PDF.
- overlay_text must be concise and ready to render.
- Add ambiguities or missing values to warnings.
"""

    def _build_docx_edit_prompt(self, *, source_text: str, block_summary: str, target_preview_text: str) -> str:
        source_block = source_text.strip() or "The source is provided as attached document(s)."
        target_block = target_preview_text.strip() or "No preview text was available from the target DOCX."
        return f"""You are editing the provided DOCX in place.

Source material summary:
{source_block}

Target DOCX preview:
{target_block}

Editable blocks:
{block_summary}

Instructions:
- Return only operations against the provided block_id values.
- Prefer replace_text_in_block when a specific phrase inside a block should change.
- Use replace_block_text when the entire block should be rewritten.
- Use insert_after_block or insert_before_block for new paragraphs adjacent to an existing block.
- Use append_to_block only for short additions to an existing block.
- Keep operations minimal and deterministic.
- Add any ambiguities or low-confidence choices to warnings.
"""

    def _page_texts_with_numbers(self, local_path: str, max_chars: int = 24000) -> str:
        doc = fitz.open(local_path)
        pages: list[str] = []
        try:
            for page_number, page in enumerate(doc, start=1):
                text = (page.get_text("text") or "").strip()
                pages.append(f"Page {page_number}:\n{text or '[no searchable text]'}")
                combined = "\n\n".join(pages)
                if len(combined) >= max_chars:
                    return combined[:max_chars]
        finally:
            doc.close()
        return "\n\n".join(pages)[:max_chars]

    def _collect_docx_blocks(self, doc: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        blocks: list[dict[str, Any]] = []
        block_map: dict[str, Any] = {}

        def add_block(block_id: str, paragraph: Any, location: str) -> None:
            text = (paragraph.text or "").strip()
            display_text = text if text else "[blank]"
            block = {
                "block_id": block_id,
                "location": location,
                "text": display_text,
                "paragraph": paragraph,
            }
            blocks.append(block)
            block_map[block_id] = paragraph

        for paragraph_index, paragraph in enumerate(doc.paragraphs):
            add_block(f"body.paragraph.{paragraph_index}", paragraph, f"body paragraph {paragraph_index}")

        for table_index, table in enumerate(doc.tables):
            for row_index, row in enumerate(table.rows):
                for cell_index, cell in enumerate(row.cells):
                    for paragraph_index, paragraph in enumerate(cell.paragraphs):
                        add_block(
                            f"table.{table_index}.row.{row_index}.cell.{cell_index}.paragraph.{paragraph_index}",
                            paragraph,
                            f"table {table_index} row {row_index} cell {cell_index} paragraph {paragraph_index}",
                        )

        for section_index, section in enumerate(doc.sections):
            for paragraph_index, paragraph in enumerate(section.header.paragraphs):
                add_block(
                    f"header.section.{section_index}.paragraph.{paragraph_index}",
                    paragraph,
                    f"header section {section_index} paragraph {paragraph_index}",
                )
            for paragraph_index, paragraph in enumerate(section.footer.paragraphs):
                add_block(
                    f"footer.section.{section_index}.paragraph.{paragraph_index}",
                    paragraph,
                    f"footer section {section_index} paragraph {paragraph_index}",
                )

        return blocks, block_map

    def _summarize_docx_blocks(self, blocks: list[dict[str, Any]]) -> str:
        lines: list[str] = []
        for block in blocks:
            lines.append(f"{block['block_id']} | {block['location']} | {block['text']}")
            combined = "\n".join(lines)
            if len(combined) >= DOCX_BLOCK_TEXT_LIMIT:
                return combined[:DOCX_BLOCK_TEXT_LIMIT]
        return "\n".join(lines)[:DOCX_BLOCK_TEXT_LIMIT]

    def _resolve_pdf_anchor_rect(self, page: fitz.Page, item: dict[str, Any]) -> fitz.Rect | None:
        anchor_text = str(item.get("anchor_text") or "").strip()
        anchor_before = str(item.get("anchor_before") or "").strip()
        anchor_after = str(item.get("anchor_after") or "").strip()

        if anchor_text:
            matches = page.search_for(anchor_text)
            if matches:
                return matches[0]

        before_rect = None
        after_rect = None
        if anchor_before:
            before_matches = page.search_for(anchor_before)
            if before_matches:
                before_rect = before_matches[0]
        if anchor_after:
            after_matches = page.search_for(anchor_after)
            if after_matches:
                after_rect = after_matches[0]

        if before_rect and after_rect:
            x0 = min(before_rect.x1, after_rect.x0)
            x1 = max(before_rect.x1, after_rect.x0)
            y0 = min(before_rect.y0, after_rect.y0)
            y1 = max(before_rect.y1, after_rect.y1)
            return fitz.Rect(x0, y0, x1, y1)

        return before_rect or after_rect

    def _target_rect_from_anchor(
        self,
        page: fitz.Page,
        anchor_rect: fitz.Rect | None,
        item: dict[str, Any],
        fallback_index: int,
    ) -> fitz.Rect:
        placement_hint = str(item.get("placement_hint") or "near_blank").strip().lower()
        font_size = float(item.get("font_size") or 10.0)
        margin = 24.0
        page_rect = page.rect
        line_height = max(font_size * 1.8, 18.0)

        if anchor_rect is None:
            y0 = margin + (fallback_index * (line_height + 6.0))
            return fitz.Rect(margin, y0, page_rect.width - margin, y0 + line_height)

        expanded = fitz.Rect(anchor_rect.x0 - 1.5, anchor_rect.y0 - 1.5, anchor_rect.x1 + 1.5, anchor_rect.y1 + 1.5)
        if placement_hint == "replace_anchor":
            return fitz.Rect(
                max(margin, expanded.x0 - 4.0),
                max(margin, expanded.y0 - 2.0),
                min(page_rect.width - margin, max(expanded.x1 + 120.0, expanded.x0 + 180.0)),
                min(page_rect.height - margin, expanded.y1 + 4.0),
            )
        if placement_hint == "below":
            y0 = expanded.y1 + 4.0
            return fitz.Rect(
                max(margin, expanded.x0),
                y0,
                min(page_rect.width - margin, max(expanded.x1 + 140.0, expanded.x0 + 220.0)),
                min(page_rect.height - margin, y0 + line_height + 8.0),
            )

        x0 = min(page_rect.width - margin - 10.0, expanded.x1 + 6.0)
        x1 = min(page_rect.width - margin, max(x0 + 180.0, expanded.x1 + 220.0))
        if x1 <= x0 + 30.0:
            x0 = max(margin, expanded.x0)
            x1 = min(page_rect.width - margin, max(expanded.x1 + 140.0, expanded.x0 + 220.0))
            y0 = expanded.y1 + 4.0
            return fitz.Rect(x0, y0, x1, min(page_rect.height - margin, y0 + line_height + 8.0))
        return fitz.Rect(x0, max(margin, expanded.y0 - 2.0), x1, min(page_rect.height - margin, expanded.y1 + 4.0))

    def _apply_pdf_overlay_plan(
        self,
        local_target_path: str,
        overlay_items: list[dict[str, Any]],
        output_path: str,
    ) -> list[str]:
        warnings: list[str] = []
        doc = fitz.open(local_target_path)
        try:
            fallback_slots: dict[int, int] = {}
            for item in overlay_items:
                overlay_text = str(item.get("overlay_text") or "").strip()
                if not overlay_text:
                    continue

                page_number = int(item.get("page_number") or 1)
                if page_number < 1 or page_number > len(doc):
                    warnings.append(f"Overlay item referenced missing page {page_number}.")
                    continue

                page = doc[page_number - 1]
                anchor_rect = self._resolve_pdf_anchor_rect(page, item)
                if anchor_rect is None:
                    warnings.append(
                        f"Could not locate anchor for overlay '{overlay_text[:40]}' on page {page_number}; placed it in a fallback position."
                    )
                fallback_index = fallback_slots.get(page_number, 0)
                target_rect = self._target_rect_from_anchor(page, anchor_rect, item, fallback_index)
                fallback_slots[page_number] = fallback_index + 1

                placement_hint = str(item.get("placement_hint") or "near_blank").strip().lower()
                cover_anchor = bool(item.get("cover_anchor")) or placement_hint == "replace_anchor"
                if cover_anchor and anchor_rect is not None:
                    page.draw_rect(
                        fitz.Rect(anchor_rect.x0 - 1.5, anchor_rect.y0 - 1.5, anchor_rect.x1 + 1.5, anchor_rect.y1 + 1.5),
                        color=(1, 1, 1),
                        fill=(1, 1, 1),
                        overlay=True,
                    )

                font_size = float(item.get("font_size") or 10.0)
                page.insert_textbox(
                    target_rect,
                    overlay_text,
                    fontsize=font_size,
                    fontname="helv",
                    color=(0, 0, 0),
                    align=fitz.TEXT_ALIGN_LEFT,
                    overlay=True,
                )

            doc.save(output_path)
        finally:
            doc.close()
        return warnings

    def _replace_text_in_docx_block(self, paragraph: Any, find_text: str, replacement_text: str) -> bool:
        needle = (find_text or "").strip()
        if not needle:
            return False
        for run in paragraph.runs:
            if needle in run.text:
                run.text = run.text.replace(needle, replacement_text, 1)
                return True

        full_text = paragraph.text or ""
        if needle not in full_text:
            return False

        paragraph.text = full_text.replace(needle, replacement_text, 1)
        return True

    def _insert_paragraph_after(self, paragraph: Any, text: str) -> Any:
        from docx.oxml import OxmlElement
        from docx.text.paragraph import Paragraph

        new_p = OxmlElement("w:p")
        paragraph._p.addnext(new_p)
        new_paragraph = Paragraph(new_p, paragraph._parent)
        if getattr(paragraph, "style", None) is not None:
            new_paragraph.style = paragraph.style
        new_paragraph.text = text
        return new_paragraph

    def _apply_docx_edit_plan(
        self,
        local_target_path: str,
        operations: list[dict[str, Any]],
        output_path: str,
    ) -> list[str]:
        from docx import Document as DocxDocument

        warnings: list[str] = []
        doc = DocxDocument(local_target_path)
        _blocks, block_map = self._collect_docx_blocks(doc)

        for operation in operations:
            action = str(operation.get("action") or "").strip()
            block_id = str(operation.get("block_id") or "").strip()
            text = str(operation.get("text") or "")
            target = block_map.get(block_id)
            if target is None:
                warnings.append(f"Could not resolve DOCX block '{block_id}'.")
                continue

            if action == "replace_text_in_block":
                find_text = str(operation.get("find_text") or "")
                if not self._replace_text_in_docx_block(target, find_text, text):
                    warnings.append(f"Could not find '{find_text}' inside DOCX block '{block_id}'.")
            elif action == "replace_block_text":
                target.text = text
            elif action == "append_to_block":
                existing = target.text or ""
                target.text = f"{existing} {text}".strip() if existing else text
            elif action == "insert_before_block":
                inserted = target.insert_paragraph_before(text)
                if getattr(target, "style", None) is not None:
                    inserted.style = target.style
            elif action == "insert_after_block":
                self._insert_paragraph_after(target, text)
            else:
                warnings.append(f"Unsupported DOCX edit action '{action}'.")

        doc.save(output_path)
        return warnings

    def _build_mapping_prompt(
        self,
        *,
        source_text: str,
        mapping_items: list[str],
        mapping_label: str,
        target_hint: str,
    ) -> str:
        source_block = source_text.strip() or "The source is provided as attached document(s)."
        names = "\n".join(f"- {item}" for item in mapping_items)
        return f"""You are filling a {target_hint} using the provided source material.

Source material summary:
{source_block}

{mapping_label}:
{names}

Instructions:
- Return one item for every provided name.
- Keep the original name exactly as given.
- Use null when the source does not clearly provide a value.
- Return concise values suitable for direct insertion into the target document.
- Add any important caveats to warnings.
"""

    async def process_run(self, run_id: str) -> dict[str, Any]:
        db = self._get_session()
        temp_dir = tempfile.mkdtemp(prefix="form_fill_run_")
        try:
            run = db.query(FormFillRun).filter(FormFillRun.id == uuid.UUID(str(run_id))).first()
            if not run:
                raise ValueError("Form Fill run not found")
            if run.status == "completed" and run.result_gcs_object_name:
                return {"success": True, "run_id": str(run.id), "skipped": True}

            run.status = "in_progress"
            run.error_message = None
            db.commit()

            source_parts: list[Any] = []
            source_text_sections: list[str] = []
            source_parts, source_text = await self._build_source_context(
                run=run,
                source_parts=source_parts,
                source_text_sections=source_text_sections,
            )

            target_local_path = os.path.join(temp_dir, f"target{_safe_ext(run.target_filename, '.bin')}")
            await self._download_to_local(run.target_gcs_object_name, target_local_path)

            target_parts: list[Any] = []
            warnings: list[str] = []
            fill_plan: dict[str, Any] = {}

            if run.target_file_type == PDF_MIME:
                pdf_fields = self._extract_pdf_form_fields(target_local_path)
                target_parts.append(self._part_from_uri(self.storage_service.construct_gcs_uri_for_object(run.target_gcs_object_name), PDF_MIME))
                if pdf_fields:
                    run.processing_strategy = "fillable_pdf"
                    mapping_payload = self._generate_json_response(
                        source_parts + target_parts + [
                            self._build_mapping_prompt(
                                source_text=source_text,
                                mapping_items=pdf_fields,
                                mapping_label="Fillable PDF field names",
                                target_hint="fillable PDF form",
                            )
                        ],
                        self._field_mapping_schema(),
                    )
                    field_values = {
                        str(item.get("name")): "" if item.get("value") is None else str(item.get("value"))
                        for item in mapping_payload.get("items") or []
                        if isinstance(item, dict) and item.get("name")
                    }
                    warnings.extend([str(item) for item in (mapping_payload.get("warnings") or []) if str(item).strip()])
                    fill_plan = {"strategy": run.processing_strategy, "field_values": field_values}
                    output_pdf_path = os.path.join(temp_dir, "filled.pdf")
                    self._apply_fillable_pdf(target_local_path, field_values, output_pdf_path)
                    final_local_path = output_pdf_path
                    final_filename = f"{Path(run.target_filename).stem}_filled.pdf"
                    final_mime_type = PDF_MIME
                else:
                    run.processing_strategy = "pdf_overlay"
                    target_preview_text = self._page_texts_with_numbers(target_local_path)
                    overlay_payload = self._generate_json_response(
                        source_parts + target_parts + [
                            self._build_pdf_overlay_prompt(
                                source_text=source_text,
                                target_preview_text=target_preview_text,
                            )
                        ],
                        self._pdf_overlay_schema(),
                    )
                    overlay_items = [
                        item for item in (overlay_payload.get("items") or []) if isinstance(item, dict) and str(item.get("overlay_text") or "").strip()
                    ]
                    warnings.extend([str(item) for item in (overlay_payload.get("warnings") or []) if str(item).strip()])
                    fill_plan = {"strategy": run.processing_strategy, "items": overlay_items}
                    final_local_path = os.path.join(temp_dir, "filled.pdf")
                    warnings.extend(self._apply_pdf_overlay_plan(target_local_path, overlay_items, final_local_path))
                    final_filename = f"{Path(run.target_filename).stem}_filled.pdf"
                    final_mime_type = PDF_MIME
                    warnings.append("The target PDF was not fillable, so Form Fill applied text overlays onto the original PDF.")
            elif run.target_file_type == DOCX_MIME:
                preview_object = f"form-fill/{run.user_id}/runs/{run.id}/target-preview.pdf"
                converter = get_document_conversion_service()
                await converter.convert_docx_gcs_to_pdf_gcs(self.storage_service, run.target_gcs_object_name, preview_object)
                target_parts.append(self._part_from_uri(self.storage_service.construct_gcs_uri_for_object(preview_object), PDF_MIME))
                placeholders = self._extract_docx_placeholders(target_local_path)
                if placeholders:
                    run.processing_strategy = "docx_placeholders"
                    mapping_payload = self._generate_json_response(
                        source_parts + target_parts + [
                            self._build_mapping_prompt(
                                source_text=source_text,
                                mapping_items=placeholders,
                                mapping_label="DOCX placeholders",
                                target_hint="DOCX template",
                            )
                        ],
                        self._field_mapping_schema(),
                    )
                    replacements = {
                        str(item.get("name")): "" if item.get("value") is None else str(item.get("value"))
                        for item in mapping_payload.get("items") or []
                        if isinstance(item, dict) and item.get("name")
                    }
                    warnings.extend([str(item) for item in (mapping_payload.get("warnings") or []) if str(item).strip()])
                    fill_plan = {"strategy": run.processing_strategy, "replacements": replacements}
                    output_docx_path = os.path.join(temp_dir, "filled.docx")
                    self._apply_docx_placeholders(target_local_path, replacements, output_docx_path)
                    final_local_path = output_docx_path
                    final_filename = f"{Path(run.target_filename).stem}_filled.docx"
                    final_mime_type = DOCX_MIME
                else:
                    run.processing_strategy = "docx_edit_in_place"
                    target_preview_text = self._extract_docx_text(target_local_path)
                    from docx import Document as DocxDocument

                    target_doc = DocxDocument(target_local_path)
                    docx_blocks, _block_map = self._collect_docx_blocks(target_doc)
                    block_summary = self._summarize_docx_blocks(docx_blocks)
                    edit_payload = self._generate_json_response(
                        source_parts + target_parts + [
                            self._build_docx_edit_prompt(
                                source_text=source_text,
                                block_summary=block_summary,
                                target_preview_text=target_preview_text,
                            )
                        ],
                        self._docx_edit_schema(),
                    )
                    operations = [
                        item for item in (edit_payload.get("operations") or []) if isinstance(item, dict) and str(item.get("action") or "").strip()
                    ]
                    warnings.extend([str(item) for item in (edit_payload.get("warnings") or []) if str(item).strip()])
                    fill_plan = {"strategy": run.processing_strategy, "operations": operations}
                    final_local_path = os.path.join(temp_dir, "filled.docx")
                    warnings.extend(self._apply_docx_edit_plan(target_local_path, operations, final_local_path))
                    final_filename = f"{Path(run.target_filename).stem}_filled.docx"
                    final_mime_type = DOCX_MIME
                    warnings.append("The DOCX target had no placeholders, so Form Fill edited the original DOCX in place.")

                if run.output_format == "pdf":
                    final_local_path = await converter.convert_docx_local_to_pdf_local(final_local_path, out_dir=temp_dir)
                    final_filename = f"{Path(run.target_filename).stem}_filled.pdf"
                    final_mime_type = PDF_MIME
            else:
                raise ValueError("Unsupported target file type")

            result_object_name = f"form-fill/{run.user_id}/runs/{run.id}/result{_safe_ext(final_filename, '.bin')}"
            await self.storage_service.upload_file(final_local_path, result_object_name)

            run.status = "completed"
            run.result_gcs_object_name = result_object_name
            run.result_filename = final_filename
            run.result_file_type = final_mime_type
            run.fill_plan = fill_plan
            run.warnings = warnings
            run.completed_at = datetime.now(timezone.utc)
            db.commit()
            return {"success": True, "run_id": str(run.id), "strategy": run.processing_strategy}
        except Exception as exc:
            logger.exception("Form Fill run %s failed", run_id)
            try:
                db.rollback()
                run = db.query(FormFillRun).filter(FormFillRun.id == uuid.UUID(str(run_id))).first()
                if run:
                    run.status = "failed"
                    run.error_message = str(exc)
                    run.completed_at = datetime.now(timezone.utc)
                    db.commit()
            except Exception:
                db.rollback()
            raise
        finally:
            db.close()
            shutil.rmtree(temp_dir, ignore_errors=True)


form_fill_service = FormFillService()
