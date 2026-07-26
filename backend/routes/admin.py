"""Admin endpoints for system management, setup, and data oversight."""
import csv
import io
import logging
import os
import secrets
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from core.database import get_db
from models.db_models import Base
# Register Inkwise's models on the shared SQLAlchemy metadata before the
# database explorer enumerates it.
from models import inkwise_models as _inkwise_models  # noqa: F401
from services.gmail_subscription_service import gmail_subscription_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# Console sections are intentionally defined server-side. This keeps product
# totals and navigation stable while still making every newly registered table
# available from the Database section automatically.
ADMIN_TABLE_GROUPS: dict[str, dict[str, Any]] = {
    "users": {
        "label": "Users & firms",
        "description": "Accounts, firms, invitations, and activation records.",
        "tables": [
            "users", "firms", "firm_invite_codes", "activation_keys",
            "activation_codes",
        ],
    },
    "extraction": {
        "label": "Document extraction",
        "description": "Jobs, runs, files, tasks, fields, results, and exports.",
        "tables": [
            "extraction_jobs", "job_runs", "source_files", "extraction_tasks",
            "source_files_to_tasks", "job_fields", "extraction_results",
            "job_exports", "templates", "template_fields", "data_types",
            "system_prompts",
        ],
    },
    "form-fill": {
        "label": "Form Fill",
        "description": "Target templates, source files, runs, and generated outputs.",
        "tables": [
            "form_fill_runs", "form_fill_templates", "form_fill_source_files",
            "form_fill_outputs",
        ],
    },
    "inkwise": {
        "label": "Inkwise",
        "description": "Writing documents, references, ingestion, retrieval, and chat.",
        "tables": [
            "inkwise_documents", "inkwise_document_folders",
            "inkwise_document_revisions", "inkwise_sources",
            "inkwise_source_ingestions", "inkwise_document_source_bindings",
            "inkwise_chat_threads", "inkwise_chat_messages",
            "inkwise_source_pages", "inkwise_source_segments",
            "inkwise_source_segment_embeddings", "inkwise_retrieval_runs",
            "inkwise_generation_attempts", "inkwise_retrieval_evidence",
            "inkwise_templates", "inkwise_system_template_categories",
            "inkwise_system_templates",
        ],
    },
    "analytics": {
        "label": "Analytics",
        "description": "Clients, projects, analyses, reconciliations, assets, and research.",
        "tables": [
            "clients", "projects", "analyses", "reconciliations",
            "amortizations", "chat_sessions", "journal_entries",
            "analytics_comments", "analytics_audit_logs",
        ],
    },
    "chrona": {
        "label": "Chrona",
        "description": "Paired devices, pairing codes, and timeline activity.",
        "tables": ["chrona_devices", "chrona_pairing_codes", "chrona_timeline_cards"],
    },
    "e-sign": {
        "label": "E-Signature",
        "description": "Envelopes, recipients, fields, templates, delivery, and administration.",
        "tables": [
            "esign_envelopes", "esign_documents", "esign_recipients",
            "esign_recipient_changes", "esign_guest_invitations",
            "esign_guest_sessions", "esign_fields", "esign_signer_attachments",
            "esign_signature_records", "esign_consent_records", "esign_events",
            "esign_templates", "esign_template_documents", "esign_template_fields",
            "esign_template_versions", "esign_bulk_jobs", "esign_bulk_rows",
            "esign_powerforms", "esign_powerform_submissions", "esign_work_items",
            "esign_email_deliveries", "esign_firm_settings", "esign_brand_assets",
            "esign_brand_profiles", "esign_permission_profiles",
            "esign_permission_assignments", "esign_envelope_grants",
            "esign_webhook_configurations", "esign_webhook_deliveries",
            "esign_webhook_attempts", "esign_admin_events",
        ],
    },
    "automations": {
        "label": "Automations",
        "description": "Automation definitions, executions, and processed messages.",
        "tables": [
            "automations", "automation_runs", "automation_processed_messages",
            "central_mailbox_state",
        ],
    },
    "platform": {
        "label": "Platform",
        "description": "Billing, usage, integrations, and connector infrastructure.",
        "tables": [
            "subscription_plans", "billing_accounts", "usage_events",
            "usage_counters", "integration_accounts", "connector_connections",
            "connector_oauth_configs", "connector_tokens", "connector_action_logs",
        ],
    },
}

_SENSITIVE_EXACT = {
    "access_token", "refresh_token", "token", "token_hash", "key_hash",
    "secret", "secret_hash", "encrypted_credentials", "encrypted_token",
    "password", "token_sha256", "public_token_sha256", "verification_token_sha256",
}
_SENSITIVE_PARTS = ("access_token", "refresh_token", "secret", "password", "key_hash")
_SENSITIVE_TABLE_COLUMNS = {
    ("activation_codes", "code"),
    ("firm_invite_codes", "code"),
    ("chrona_pairing_codes", "code"),
}


def _require_console_admin(x_admin_token: str | None = Header(default=None)) -> None:
    """Protect browser console calls without putting the token in the URL."""
    expected = os.getenv("ADMIN_TOKEN")
    if not expected or not x_admin_token or not secrets.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=401, detail="Invalid admin token")


def _table_or_404(table_name: str):
    table = Base.metadata.tables.get(table_name)
    if table is None:
        raise HTTPException(status_code=404, detail="Unknown database table")
    return table


def _is_sensitive(column_name: str, table_name: str | None = None) -> bool:
    name = column_name.lower()
    return (
        (table_name, name) in _SENSITIVE_TABLE_COLUMNS
        or name in _SENSITIVE_EXACT
        or any(part in name for part in _SENSITIVE_PARTS)
    )


def _json_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (UUID, Decimal)):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return f"[binary data: {len(value)} bytes]"
    if isinstance(value, (dict, list)):
        return value
    return str(value)


def _serialize_mapping(mapping: Any, table: Any) -> dict[str, Any]:
    row: dict[str, Any] = {}
    for column in table.columns:
        value = mapping.get(column.name)
        if value is not None and _is_sensitive(column.name, table.name):
            row[column.name] = "[redacted]"
        else:
            row[column.name] = _json_value(value)
    return row


def _table_schema(table: Any) -> list[dict[str, Any]]:
    return [
        {
            "name": column.name,
            "type": str(column.type),
            "nullable": bool(column.nullable),
            "primary_key": bool(column.primary_key),
            "redacted": _is_sensitive(column.name, table.name),
        }
        for column in table.columns
    ]


def _default_order_column(table: Any):
    for name in ("created_at", "updated_at", "triggered_at", "synced_at", "started_at", "id"):
        if name in table.c:
            return table.c[name]
    primary_key = list(table.primary_key.columns)
    return primary_key[0] if primary_key else None


def _safe_count(db: Session, table: Any) -> int | None:
    try:
        return int(db.execute(select(func.count()).select_from(table)).scalar_one())
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Admin console could not count table %s", table.name)
        return None


@router.get("/console/auth")
async def verify_console_access(_: None = Depends(_require_console_admin)):
    return {"authenticated": True}


@router.get("/console/catalog")
async def get_console_catalog(
    db: Session = Depends(get_db),
    _: None = Depends(_require_console_admin),
):
    tables = []
    grouped_names = {
        name for group in ADMIN_TABLE_GROUPS.values() for name in group["tables"]
    }
    for table in sorted(Base.metadata.tables.values(), key=lambda item: item.name):
        tables.append({
            "name": table.name,
            "columns": len(table.columns),
            "count": _safe_count(db, table),
            "grouped": table.name in grouped_names,
        })

    by_name = {item["name"]: item for item in tables}
    groups = []
    for slug, group in ADMIN_TABLE_GROUPS.items():
        group_tables = [by_name[name] for name in group["tables"] if name in by_name]
        groups.append({
            "slug": slug,
            "label": group["label"],
            "description": group["description"],
            "tables": group_tables,
            "row_count": sum(item["count"] or 0 for item in group_tables),
        })
    return {"groups": groups, "tables": tables}


@router.get("/console/overview")
async def get_console_overview(
    db: Session = Depends(get_db),
    _: None = Depends(_require_console_admin),
):
    table_counts: dict[str, int | None] = {}
    for table in Base.metadata.tables.values():
        table_counts[table.name] = _safe_count(db, table)

    product_counts = []
    for slug, group in ADMIN_TABLE_GROUPS.items():
        product_counts.append({
            "slug": slug,
            "label": group["label"],
            "count": sum(table_counts.get(name) or 0 for name in group["tables"]),
            "tables": len([name for name in group["tables"] if name in table_counts]),
        })

    activity = []
    activity_tables = [
        ("extraction_jobs", "Extraction job", "name"),
        ("form_fill_runs", "Form Fill run", "target_filename"),
        ("inkwise_documents", "Inkwise document", "title"),
        ("esign_envelopes", "E-Signature envelope", "title"),
        ("automation_runs", "Automation run", "status"),
        ("chrona_timeline_cards", "Chrona timeline card", "title"),
    ]
    for table_name, kind, title_column in activity_tables:
        table = Base.metadata.tables.get(table_name)
        if table is None:
            continue
        order_column = _default_order_column(table)
        try:
            statement = select(table)
            if order_column is not None:
                statement = statement.order_by(order_column.desc().nullslast())
            rows = db.execute(statement.limit(4)).mappings().all()
            for row in rows:
                timestamp = (
                    row.get("created_at") or row.get("updated_at")
                    or row.get("triggered_at") or row.get("synced_at")
                    or row.get("started_at")
                )
                activity.append({
                    "table": table_name,
                    "kind": kind,
                    "id": _json_value(row.get("id")),
                    "title": _json_value(row.get(title_column)) or kind,
                    "status": _json_value(row.get("status")),
                    "timestamp": _json_value(timestamp),
                })
        except SQLAlchemyError:
            db.rollback()
            logger.exception("Admin console could not load activity from %s", table_name)

    activity.sort(key=lambda item: item["timestamp"] or "", reverse=True)
    return {
        "table_count": len(Base.metadata.tables),
        "row_count": sum(value or 0 for value in table_counts.values()),
        "product_counts": product_counts,
        "table_counts": table_counts,
        "recent_activity": activity[:12],
    }


@router.get("/console/tables/{table_name}")
async def get_console_table(
    table_name: str,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: None = Depends(_require_console_admin),
):
    table = _table_or_404(table_name)
    total = _safe_count(db, table)
    if total is None:
        raise HTTPException(status_code=503, detail="Table is unavailable")

    statement = select(table)
    order_column = _default_order_column(table)
    if order_column is not None:
        statement = statement.order_by(order_column.desc().nullslast())
    rows = db.execute(statement.offset((page - 1) * limit).limit(limit)).mappings().all()
    return {
        "table": table_name,
        "columns": _table_schema(table),
        "rows": [_serialize_mapping(row, table) for row in rows],
        "page": page,
        "limit": limit,
        "total": total,
        "pages": max(1, (total + limit - 1) // limit),
    }


@router.get("/console/tables/{table_name}/export")
async def export_console_table(
    table_name: str,
    db: Session = Depends(get_db),
    _: None = Depends(_require_console_admin),
):
    table = _table_or_404(table_name)
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[column.name for column in table.columns])
    writer.writeheader()
    order_column = _default_order_column(table)
    statement = select(table)
    if order_column is not None:
        statement = statement.order_by(order_column.desc().nullslast())
    for mapping in db.execute(statement).mappings():
        writer.writerow(_serialize_mapping(mapping, table))
    output.seek(0)
    headers = {"Content-Disposition": f'attachment; filename="{table_name}.csv"'}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)

@router.post("/setup-gmail-pubsub")
async def setup_gmail_pubsub(
    db: Session = Depends(get_db),
    admin_token: str = Query(..., description="Admin token for authentication")
):
    """
    Set up Gmail Pub/Sub infrastructure and watch for all users
    
    This endpoint should be called once during deployment to set up:
    1. Google Cloud Pub/Sub topic and subscription
    2. Gmail watch for all existing users with Google integrations
    """
    try:
        # Validate admin token
        import os
        expected_token = os.getenv('ADMIN_TOKEN')
        if not expected_token or admin_token != expected_token:
            raise HTTPException(status_code=401, detail="Invalid admin token")
        
        # Validate configuration first
        config_status = gmail_subscription_service.validate_configuration()
        if not config_status['valid']:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid configuration: {config_status['errors']}"
            )
        
        # Set up Pub/Sub infrastructure
        logger.info("Setting up Gmail Pub/Sub infrastructure...")
        pubsub_success = gmail_subscription_service.setup_pubsub_infrastructure()
        
        if not pubsub_success:
            raise HTTPException(
                status_code=500, 
                detail="Failed to set up Pub/Sub infrastructure"
            )
        
        # Set up Gmail watch for all users
        logger.info("Setting up Gmail watch for all users...")
        watch_results = gmail_subscription_service.setup_gmail_watch_for_all_users(db)
        
        return {
            "status": "success",
            "message": "Gmail Pub/Sub setup completed",
            "pubsub_setup": "successful",
            "gmail_watch_results": watch_results,
            "configuration": {
                "topic_name": gmail_subscription_service.get_topic_name(),
                "webhook_url": gmail_subscription_service.get_webhook_url()
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gmail Pub/Sub setup failed: {e}")
        raise HTTPException(status_code=500, detail=f"Setup failed: {str(e)}")

@router.post("/setup-gmail-watch/{user_id}")
async def setup_gmail_watch_for_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin_token: str = Query(..., description="Admin token for authentication")
):
    """
    Set up Gmail watch for a specific user
    
    This can be used to set up Gmail watch for new users or retry failed setups.
    """
    try:
        # Validate admin token
        import os
        expected_token = os.getenv('ADMIN_TOKEN')
        if not expected_token or admin_token != expected_token:
            raise HTTPException(status_code=401, detail="Invalid admin token")
        
        # Set up Gmail watch for the user
        success = gmail_subscription_service.setup_gmail_watch_for_user(db, user_id)
        
        if success:
            return {
                "status": "success",
                "message": f"Gmail watch setup successful for user {user_id}",
                "user_id": user_id
            }
        else:
            raise HTTPException(
                status_code=500, 
                detail=f"Gmail watch setup failed for user {user_id}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gmail watch setup failed for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Setup failed: {str(e)}")

@router.get("/gmail-pubsub-status")
async def get_gmail_pubsub_status(
    admin_token: str = Query(..., description="Admin token for authentication")
):
    """
    Get Gmail Pub/Sub configuration status
    """
    try:
        # Validate admin token
        import os
        expected_token = os.getenv('ADMIN_TOKEN')
        if not expected_token or admin_token != expected_token:
            raise HTTPException(status_code=401, detail="Invalid admin token")
        
        # Get configuration status
        config_status = gmail_subscription_service.validate_configuration()
        
        return {
            "configuration": config_status,
            "settings": {
                "topic_name": gmail_subscription_service.get_topic_name(),
                "webhook_url": gmail_subscription_service.get_webhook_url(),
                "project_id": os.getenv('GOOGLE_CLOUD_PROJECT_ID')
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get Gmail Pub/Sub status: {e}")
        raise HTTPException(status_code=500, detail=f"Status check failed: {str(e)}")
