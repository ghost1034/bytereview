"""Universal Document Analysis adapter for the authenticated Claw MCP gateway.

This module deliberately contains no extraction or storage implementation.  It
validates the MCP-facing contract, enforces ownership, and delegates mutations
to the same JobService/TemplateService methods used by the web application.
"""
from __future__ import annotations

import base64
import json
import logging
import os
from pathlib import PurePosixPath
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.constants import MAX_DIRECT_UPLOAD_BYTES
from core.database import db_config
from models.db_models import (
    ConnectorActionLog,
    DataType,
    ExtractionJob,
    ExtractionResult,
    ExtractionTask,
    JobField,
    JobRun,
    SourceFile,
    SourceFileToTask,
    Template,
    TemplateField,
)
from models.job import FileUploadInfo, JobFilesCompleteUploadRequest, JobFilesInitiateUploadRequest
from services.document_conversion_service import (
    SUPPORTED_EXTRACTION_MIME_TYPES,
    normalize_source_mime_type,
)
from services.job_service import JobService
from services.template_service import TemplateService


DASHBOARD_BASE_URL = os.getenv("CPAA_DASHBOARD_PUBLIC_URL", "https://cpaautomation.ai").rstrip("/")
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".zip"}
PROCESSING_MODES = {"individual", "combined"}
MAX_RESULT_ROWS = 200
logger = logging.getLogger(__name__)


class UdaMcpError(Exception):
    """Expected MCP error with a stable, non-HTTP machine code."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def uda_mcp_enabled() -> bool:
    return os.getenv("CLAW_UDA_MCP_ENABLED", "false").strip().lower() in {"1", "true", "yes", "on"}


def audit_uda_mcp_call(user_id: str, tool_name: str, success: bool, duration_ms: int) -> None:
    """Best-effort metadata-only audit entry for a state-changing UDA call."""
    db = db_config.get_session()
    try:
        db.add(
            ConnectorActionLog(
                user_id=user_id,
                source="mcp",
                service="document_analysis",
                action_id=tool_name,
                connection_name=None,
                success=success,
                status_code=200 if success else 400,
                duration_ms=duration_ms,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
        # Auditing must not turn a successful analysis operation into a failure.
        logger.exception("Failed to write UDA MCP action audit metadata")
    finally:
        db.close()


def _dashboard_url(job_id: str) -> str:
    return f"{DASHBOARD_BASE_URL}/dashboard/jobs/{job_id}"


def _encode_cursor(offset: int) -> str:
    raw = json.dumps({"offset": offset}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _decode_cursor(cursor: Optional[str]) -> int:
    if not cursor:
        return 0
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        value = json.loads(base64.urlsafe_b64decode(padded.encode()).decode())
        offset = value["offset"]
        if not isinstance(offset, int) or offset < 0:
            raise ValueError
        return offset
    except Exception as exc:
        raise UdaMcpError("invalid_input", "cursor is invalid.") from exc


def _serialize_time(value: Any) -> Optional[str]:
    return value.isoformat() if value is not None else None


def _is_archive(source_file: SourceFile) -> bool:
    return (source_file.file_type or "").lower() in {
        "application/zip",
        "application/x-zip-compressed",
    } or (source_file.original_filename or "").lower().endswith(".zip")


def _map_service_error(exc: Exception) -> UdaMcpError:
    if isinstance(exc, UdaMcpError):
        return exc
    message = str(getattr(exc, "detail", None) or exc)
    lowered = message.lower()
    if isinstance(exc, HTTPException):
        if exc.status_code == 404:
            return UdaMcpError("not_found", message)
        if exc.status_code == 413:
            return UdaMcpError("invalid_input", message)
        if "upload not found" in lowered:
            return UdaMcpError("upload_expired", message)
        if exc.status_code == 409:
            return UdaMcpError("files_not_ready", message)
        if 400 <= exc.status_code < 500:
            return UdaMcpError("invalid_input", message)
    if "plan limit" in lowered or "pages remaining" in lowered or "upgrade your plan" in lowered:
        return UdaMcpError("plan_limit_exceeded", message)
    if "not found" in lowered or "access denied" in lowered:
        return UdaMcpError("not_found", message)
    if "still" in lowered and ("file" in lowered or "upload" in lowered):
        return UdaMcpError("files_not_ready", message)
    if "failed" in lowered and "task" in lowered:
        return UdaMcpError("analysis_failed", message)
    return UdaMcpError("invalid_input", message)


class UdaMcpService:
    def __init__(
        self,
        job_service: Optional[JobService] = None,
        template_service: Optional[TemplateService] = None,
    ) -> None:
        self.job_service = job_service or JobService()
        self.template_service = template_service or TemplateService()

    def _owned_run(self, db: Session, user_id: str, job_id: str, run_id: Optional[str]) -> JobRun:
        query = db.query(JobRun).join(ExtractionJob).filter(
            JobRun.job_id == job_id,
            ExtractionJob.id == job_id,
            ExtractionJob.user_id == user_id,
            ExtractionJob.job_type == "extraction",
        )
        if run_id:
            query = query.filter(JobRun.id == run_id)
        else:
            query = query.order_by(JobRun.created_at.desc())
        run = query.first()
        if not run:
            raise UdaMcpError("not_found", "Document analysis or run not found.")
        return run

    @staticmethod
    def _validate_file_metadata(files: Any) -> List[FileUploadInfo]:
        if not isinstance(files, list) or not files:
            raise UdaMcpError("invalid_input", "files must be a non-empty array.")
        validated: List[FileUploadInfo] = []
        for index, item in enumerate(files):
            if not isinstance(item, dict):
                raise UdaMcpError("invalid_input", f"files[{index}] must be an object.")
            filename = str(item.get("filename") or "").strip()
            path = str(item.get("path") or filename).strip()
            content_type = str(item.get("content_type") or item.get("type") or "application/octet-stream").strip()
            size = item.get("size_bytes", item.get("size"))
            if not filename or not path or not isinstance(size, int) or isinstance(size, bool) or size < 1:
                raise UdaMcpError(
                    "invalid_input",
                    f"files[{index}] requires filename, path, and a positive integer size_bytes.",
                )
            if size > MAX_DIRECT_UPLOAD_BYTES:
                raise UdaMcpError("invalid_input", f"{filename} exceeds the 50 MB per-file limit.")
            extension = os.path.splitext(filename)[1].lower()
            normalized_type = normalize_source_mime_type(filename, content_type)
            if extension not in SUPPORTED_EXTENSIONS or normalized_type not in SUPPORTED_EXTRACTION_MIME_TYPES:
                raise UdaMcpError(
                    "invalid_input",
                    f"Unsupported document format for {filename}. Supported formats: PDF, DOCX, PPTX, XLSX, CSV, ZIP.",
                )
            normalized_path = path.replace("\\", "/").strip("/")
            if not normalized_path or ".." in PurePosixPath(normalized_path).parts:
                raise UdaMcpError("invalid_input", f"Invalid path for {filename}.")
            validated.append(
                FileUploadInfo(filename=filename, path=normalized_path, size=size, type=normalized_type)
            )
        return validated

    async def get_options(self, db: Session) -> Dict[str, Any]:
        data_types = db.query(DataType).order_by(DataType.display_order, DataType.id).all()
        return {
            "supported_formats": ["PDF", "DOCX", "PPTX", "XLSX", "CSV", "ZIP"],
            "max_file_size_bytes": MAX_DIRECT_UPLOAD_BYTES,
            "max_file_size_mb": 50,
            "processing_modes": sorted(PROCESSING_MODES),
            "data_types": [
                {
                    "id": row.id,
                    "display_name": row.display_name,
                    "description": row.description,
                    "base_json_type": row.base_json_type,
                }
                for row in data_types
            ],
        }

    async def list_templates(self, db: Session, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        query_text = str(args.get("query") or "").strip()
        limit = args.get("limit", 50)
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 100:
            raise UdaMcpError("invalid_input", "limit must be an integer from 1 to 100.")
        offset = _decode_cursor(args.get("cursor"))
        query = db.query(Template).filter(
            Template.template_type == "extraction",
            or_(Template.user_id == user_id, Template.is_public.is_(True)),
        )
        if query_text:
            query = query.filter(Template.name.ilike(f"%{query_text}%"))
        rows = query.order_by(Template.is_public.asc(), Template.name.asc(), Template.id.asc()).offset(offset).limit(limit + 1).all()
        has_more = len(rows) > limit
        rows = rows[:limit]
        template_ids = [row.id for row in rows]
        fields_by_template: Dict[Any, List[TemplateField]] = {template_id: [] for template_id in template_ids}
        if template_ids:
            for field in db.query(TemplateField).filter(TemplateField.template_id.in_(template_ids)).order_by(
                TemplateField.template_id, TemplateField.display_order
            ):
                fields_by_template[field.template_id].append(field)
        return {
            "templates": [
                {
                    "id": str(row.id),
                    "name": row.name,
                    "description": row.description,
                    "is_public": bool(row.is_public),
                    "fields": [
                        {"name": field.field_name, "data_type": field.data_type_id, "prompt": field.ai_prompt}
                        for field in fields_by_template.get(row.id, [])
                    ],
                }
                for row in rows
            ],
            "next_cursor": _encode_cursor(offset + limit) if has_more else None,
        }

    async def list_analyses(self, db: Session, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        limit = args.get("limit", 25)
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= 100:
            raise UdaMcpError("invalid_input", "limit must be an integer from 1 to 100.")
        offset = _decode_cursor(args.get("cursor"))
        jobs = db.query(ExtractionJob).filter(
            ExtractionJob.user_id == user_id,
            ExtractionJob.job_type == "extraction",
        ).order_by(ExtractionJob.created_at.desc(), ExtractionJob.id.desc()).offset(offset).limit(limit + 1).all()
        has_more = len(jobs) > limit
        jobs = jobs[:limit]
        analyses = []
        for job in jobs:
            run = db.query(JobRun).filter(JobRun.job_id == job.id).order_by(JobRun.created_at.desc()).first()
            analyses.append({
                "job_id": str(job.id),
                "name": job.name,
                "created_at": _serialize_time(job.created_at),
                "latest_run": None if run is None else {
                    "run_id": str(run.id),
                    "status": run.status,
                    "config_step": run.config_step,
                    "tasks_total": run.tasks_total,
                    "tasks_completed": run.tasks_completed,
                    "tasks_failed": run.tasks_failed,
                },
                "dashboard_url": _dashboard_url(str(job.id)),
            })
        return {"analyses": analyses, "next_cursor": _encode_cursor(offset + limit) if has_more else None}

    async def create_analysis(self, db: Session, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        name = str(args.get("name") or "").strip()
        if len(name) > 255:
            raise UdaMcpError("invalid_input", "name must be 255 characters or fewer.")
        try:
            job_id = await self.job_service.create_job(user_id, name=name or None)
            run = self.job_service.get_latest_run(job_id, user_id)
        except Exception as exc:
            raise _map_service_error(exc) from exc
        if not run:
            raise UdaMcpError("internal_error", "The initial document analysis run was not created.")
        return {"job_id": job_id, "run_id": str(run.id), "dashboard_url": _dashboard_url(job_id)}

    async def prepare_uploads(self, db: Session, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        job_id = str(args.get("job_id") or "").strip()
        run_id = str(args.get("run_id") or "").strip() or None
        if not job_id:
            raise UdaMcpError("invalid_input", "job_id is required.")
        run = self._owned_run(db, user_id, job_id, run_id)
        files = self._validate_file_metadata(args.get("files"))
        request = JobFilesInitiateUploadRequest(files=files)
        try:
            initiated = await self.job_service.initiate_job_run_file_uploads(
                user_id, job_id, request, run_id=str(run.id)
            )
        except Exception as exc:
            raise _map_service_error(exc) from exc
        by_path = {item.path: item for item in files}
        return {
            "job_id": job_id,
            "run_id": str(run.id),
            "expires_in_seconds": 3600,
            "uploads": [
                {
                    "source_file_id": item.id,
                    "original_path": item.original_path,
                    "upload_url": item.upload_url,
                    "method": "PUT",
                    "required_headers": {"Content-Type": by_path[item.original_path].type},
                }
                for item in initiated
            ],
        }

    async def complete_uploads(self, db: Session, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        job_id = str(args.get("job_id") or "").strip()
        run_id = str(args.get("run_id") or "").strip() or None
        file_ids = args.get("source_file_ids") or args.get("file_ids")
        if not job_id or not isinstance(file_ids, list) or not file_ids or not all(isinstance(v, str) and v for v in file_ids):
            raise UdaMcpError("invalid_input", "job_id and a non-empty source_file_ids array are required.")
        run = self._owned_run(db, user_id, job_id, run_id)
        try:
            completed = await self.job_service.complete_job_run_file_uploads(
                user_id,
                job_id,
                JobFilesCompleteUploadRequest(file_ids=file_ids),
                run_id=str(run.id),
            )
        except Exception as exc:
            raise _map_service_error(exc) from exc
        refreshed = db.query(SourceFile).filter(
            SourceFile.job_run_id == run.id,
            SourceFile.id.in_(file_ids),
        ).all()
        by_id = {str(file.id): file for file in refreshed}
        files = []
        for item in completed:
            source = by_id.get(str(item["id"]))
            files.append({
                **item,
                "page_count": source.page_count if source else None,
                "ready": bool(source) and (
                    (_is_archive(source) and source.status == "unpacked")
                    or (not _is_archive(source) and source.status == "uploaded" and source.page_count is not None)
                ),
            })
        return {"job_id": job_id, "run_id": str(run.id), "files": files}

    async def _validated_fields(
        self, db: Session, user_id: str, args: Dict[str, Any]
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        template_id = str(args.get("template_id") or "").strip() or None
        raw_fields = args.get("fields")
        if bool(template_id) == bool(raw_fields):
            raise UdaMcpError("invalid_input", "Provide exactly one of template_id or fields.")
        if template_id:
            template = await self.template_service.get_template(template_id, user_id)
            if not template or template.template_type != "extraction":
                raise UdaMcpError("not_found", "Template not found.")
            return [
                {
                    "field_name": field.name,
                    "data_type_id": field.data_type,
                    "ai_prompt": field.prompt,
                    "display_order": index,
                }
                for index, field in enumerate(template.fields)
            ], template_id
        if not isinstance(raw_fields, list) or not raw_fields:
            raise UdaMcpError("invalid_input", "fields must be a non-empty array.")
        valid_types = {row[0] for row in db.query(DataType.id).all()}
        fields: List[Dict[str, Any]] = []
        seen = set()
        for index, raw in enumerate(raw_fields):
            if not isinstance(raw, dict):
                raise UdaMcpError("invalid_input", f"fields[{index}] must be an object.")
            name = str(raw.get("name") or raw.get("field_name") or "").strip()
            data_type = str(raw.get("data_type") or raw.get("data_type_id") or "").strip()
            prompt = str(raw.get("prompt") or raw.get("ai_prompt") or "").strip()
            key = name.casefold()
            if not name or len(name) > 100:
                raise UdaMcpError("invalid_input", f"fields[{index}].name must be 1 to 100 characters.")
            if key in seen:
                raise UdaMcpError("invalid_input", f"Duplicate field name: {name}.")
            if data_type not in valid_types:
                raise UdaMcpError("invalid_input", f"Unknown data type for {name}: {data_type}.")
            if len(prompt) > 1500:
                raise UdaMcpError("invalid_input", f"Prompt for {name} exceeds 1,500 characters.")
            seen.add(key)
            fields.append({
                "field_name": name,
                "data_type_id": data_type,
                "ai_prompt": prompt,
                "display_order": index,
            })
        return fields, None

    async def configure_analysis(self, db: Session, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        job_id = str(args.get("job_id") or "").strip()
        run_id = str(args.get("run_id") or "").strip() or None
        if not job_id:
            raise UdaMcpError("invalid_input", "job_id is required.")
        run = self._owned_run(db, user_id, job_id, run_id)
        fields, template_id = await self._validated_fields(db, user_id, args)
        files = db.query(SourceFile).filter(SourceFile.job_run_id == run.id).all()
        processable = [file for file in files if not _is_archive(file)]
        archives = [file for file in files if _is_archive(file)]
        if not processable:
            raise UdaMcpError("files_not_ready", "No processable uploaded files are ready to configure.")
        if any(file.status != "unpacked" for file in archives) or any(
            file.status in {"uploading", "importing", "unpacking", "failed"} or file.page_count is None
            for file in processable
        ):
            raise UdaMcpError("files_not_ready", "All files must finish upload, ZIP expansion, and page counting before configuration.")
        default_mode = str(args.get("default_processing_mode") or "individual").strip().lower()
        overrides = args.get("folder_processing_modes") or {}
        if default_mode not in PROCESSING_MODES or not isinstance(overrides, dict):
            raise UdaMcpError("invalid_input", "Processing modes must be individual or combined.")
        folders = {os.path.dirname(file.original_path or "") or "/" for file in processable}
        unknown_folders = set(overrides) - folders
        if unknown_folders:
            raise UdaMcpError("invalid_input", f"Unknown folder path(s): {', '.join(sorted(unknown_folders))}.")
        processing_modes = {folder: str(overrides.get(folder, default_mode)).strip().lower() for folder in folders}
        if any(mode not in PROCESSING_MODES for mode in processing_modes.values()):
            raise UdaMcpError("invalid_input", "Processing modes must be individual or combined.")
        description = args.get("description")
        if description is not None and not isinstance(description, str):
            raise UdaMcpError("invalid_input", "description must be a string.")
        try:
            await self.job_service.update_job_fields(
                job_id=job_id,
                user_id=user_id,
                fields=fields,
                template_id=template_id,
                processing_modes=processing_modes,
                run_id=str(run.id),
                description=description,
            )
        except Exception as exc:
            raise _map_service_error(exc) from exc
        page_total = sum(int(file.page_count or 0) for file in processable)
        return {
            "job_id": job_id,
            "run_id": str(run.id),
            "file_count": len(processable),
            "page_total": page_total,
            "field_count": len(fields),
            "fields": [{"name": field["field_name"], "data_type": field["data_type_id"]} for field in fields],
            "processing_modes": processing_modes,
            "approval_required": True,
            "dashboard_url": _dashboard_url(job_id),
        }

    async def start_analysis(self, db: Session, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if args.get("confirmed_by_user") is not True:
            raise UdaMcpError("approval_required", "Set confirmed_by_user=true only after presenting the file/page/field summary and receiving explicit user approval.")
        job_id = str(args.get("job_id") or "").strip()
        run_id = str(args.get("run_id") or "").strip() or None
        if not job_id:
            raise UdaMcpError("invalid_input", "job_id is required.")
        run = self._owned_run(db, user_id, job_id, run_id)
        if run.config_step == "submitted":
            return {
                "job_id": job_id,
                "run_id": str(run.id),
                "status": run.status,
                "idempotent_replay": True,
                "dashboard_url": _dashboard_url(job_id),
            }
        files = db.query(SourceFile).filter(SourceFile.job_run_id == run.id).all()
        processable = [file for file in files if not _is_archive(file)]
        archives = [file for file in files if _is_archive(file)]
        if not processable or any(
            file.status in {"uploading", "importing", "unpacking", "failed"} or file.page_count is None
            for file in processable
        ) or any(file.status != "unpacked" for file in archives):
            raise UdaMcpError("files_not_ready", "Files are not ready for analysis.")
        if db.query(JobField).filter(JobField.job_run_id == run.id).count() == 0:
            raise UdaMcpError("invalid_input", "Configure at least one extraction field before starting.")
        if db.query(ExtractionTask).filter(ExtractionTask.job_run_id == run.id, ExtractionTask.status == "pending").count() == 0:
            raise UdaMcpError("invalid_input", "No extraction tasks are configured for this run.")
        try:
            submitted_run_id = await self.job_service.submit_manual_job(job_id, user_id, run_id=str(run.id))
        except Exception as exc:
            lowered = str(exc).lower()
            if "already submitted" in lowered or "already in progress" in lowered:
                return {
                    "job_id": job_id,
                    "run_id": str(run.id),
                    "status": "in_progress",
                    "idempotent_replay": True,
                    "dashboard_url": _dashboard_url(job_id),
                }
            raise _map_service_error(exc) from exc
        return {
            "job_id": job_id,
            "run_id": submitted_run_id,
            "status": "in_progress",
            "idempotent_replay": False,
            "dashboard_url": _dashboard_url(job_id),
        }

    async def get_status(self, db: Session, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        job_id = str(args.get("job_id") or "").strip()
        run_id = str(args.get("run_id") or "").strip() or None
        if not job_id:
            raise UdaMcpError("invalid_input", "job_id is required.")
        run = self._owned_run(db, user_id, job_id, run_id)
        files = db.query(SourceFile).filter(SourceFile.job_run_id == run.id).order_by(SourceFile.original_path).all()
        tasks = db.query(ExtractionTask).filter(ExtractionTask.job_run_id == run.id).order_by(ExtractionTask.created_at).all()
        processable = [file for file in files if not _is_archive(file)]
        archives = [file for file in files if _is_archive(file)]
        archives_ready = all(file.status == "unpacked" for file in archives)
        processable_ready = bool(processable) and all(
            file.status not in {"uploading", "importing", "unpacking", "failed"} and file.page_count is not None
            for file in processable
        )
        return {
            "job_id": job_id,
            "run_id": str(run.id),
            "status": run.status,
            "config_step": run.config_step,
            "progress": {
                "tasks_total": len(tasks),
                "tasks_completed": sum(task.status == "completed" for task in tasks),
                "tasks_failed": sum(task.status == "failed" for task in tasks),
            },
            "page_total": sum(int(file.page_count or 0) for file in processable),
            "files_ready": processable_ready and archives_ready,
            "archives_ready": archives_ready,
            "files": [
                {
                    "source_file_id": str(file.id),
                    "path": file.original_path,
                    "status": file.status,
                    "page_count": file.page_count,
                    "is_archive": _is_archive(file),
                }
                for file in files
            ],
            "task_failures": [
                {"task_id": str(task.id), "error": task.error_message}
                for task in tasks if task.status == "failed"
            ],
            "dashboard_url": _dashboard_url(job_id),
        }

    async def get_results(self, db: Session, user_id: str, args: Dict[str, Any]) -> Dict[str, Any]:
        job_id = str(args.get("job_id") or "").strip()
        run_id = str(args.get("run_id") or "").strip() or None
        if not job_id:
            raise UdaMcpError("invalid_input", "job_id is required.")
        limit = args.get("limit", MAX_RESULT_ROWS)
        if not isinstance(limit, int) or isinstance(limit, bool) or not 1 <= limit <= MAX_RESULT_ROWS:
            raise UdaMcpError("invalid_input", f"limit must be an integer from 1 to {MAX_RESULT_ROWS}.")
        offset = _decode_cursor(args.get("cursor"))
        run = self._owned_run(db, user_id, job_id, run_id)
        tasks = db.query(ExtractionTask).filter(ExtractionTask.job_run_id == run.id).order_by(
            ExtractionTask.result_set_index, ExtractionTask.created_at, ExtractionTask.id
        ).all()
        if run.status == "failed" and tasks and all(task.status == "failed" for task in tasks):
            raise UdaMcpError("analysis_failed", "Document analysis failed. Check status for task errors.")
        task_ids = [task.id for task in tasks]
        results_by_task = {
            result.task_id: result
            for result in (db.query(ExtractionResult).filter(ExtractionResult.task_id.in_(task_ids)).all() if task_ids else [])
        }
        sources_by_task: Dict[Any, List[SourceFile]] = {task_id: [] for task_id in task_ids}
        if task_ids:
            source_rows = db.query(SourceFileToTask.task_id, SourceFile).join(
                SourceFile, SourceFileToTask.source_file_id == SourceFile.id
            ).filter(SourceFileToTask.task_id.in_(task_ids)).all()
            for task_id, source in source_rows:
                sources_by_task[task_id].append(source)
        page: List[Dict[str, Any]] = []
        total_rows = 0
        for task in tasks:
            result = results_by_task.get(task.id)
            data = result.extracted_data if result else {}
            columns = data.get("columns") if isinstance(data, dict) else None
            rows = data.get("results") if isinstance(data, dict) else None
            if not isinstance(columns, list) or not isinstance(rows, list):
                continue
            row_ids = data.get("row_ids") if isinstance(data.get("row_ids"), list) else []
            row_sources = data.get("row_sources") if isinstance(data.get("row_sources"), list) else []
            sources = sorted(sources_by_task.get(task.id, []), key=lambda item: item.original_path or "")
            for index, values in enumerate(rows):
                if isinstance(values, list):
                    structured = {str(column): values[i] if i < len(values) else None for i, column in enumerate(columns)}
                elif isinstance(values, dict):
                    structured = values
                else:
                    structured = {"value": values}
                if offset <= total_rows < offset + limit:
                    page.append({
                        "task_id": str(task.id),
                        "row_id": row_ids[index] if index < len(row_ids) else f"{task.id}:{index}",
                        "row_source": row_sources[index] if index < len(row_sources) else "ai",
                        "processing_mode": task.processing_mode,
                        "result_set_index": task.result_set_index,
                        "source_files": [
                            {"source_file_id": str(source.id), "path": source.original_path}
                            for source in sources
                        ],
                        "data": structured,
                    })
                total_rows += 1
        next_offset = offset + len(page)
        return {
            "job_id": job_id,
            "run_id": str(run.id),
            "rows": page,
            "next_cursor": _encode_cursor(next_offset) if next_offset < total_rows else None,
            "has_more": next_offset < total_rows,
            "total_rows": total_rows,
            "dashboard_url": _dashboard_url(job_id),
        }


uda_mcp_service = UdaMcpService()
