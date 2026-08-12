"""Transactional command boundary and leased Tasklytic job outbox."""

from __future__ import annotations

import inspect
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

from fastapi import HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.tasklytic import TasklyticCommand, TasklyticCommandRun


CommandOperation = Callable[[], Any]
CommandHandler = Callable[[Session, TasklyticCommand], Any | Awaitable[Any]]
TERMINAL_STATUSES = frozenset({"succeeded", "failed"})
ACTIVE_STATUSES = frozenset({"pending", "leased", "retry"})
INLINE_WORKER = "request"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _scope_key(workspace_id: str | None, actor_id: str) -> str:
    return f"w:{workspace_id}" if workspace_id else f"u:{actor_id}"


def enqueue_command(
    db: Session,
    *,
    command_type: str,
    deduplication_key: str,
    payload: dict[str, Any] | None,
    actor_id: str,
    workspace_id: str | None = None,
    max_attempts: int = 5,
    retry_base_seconds: int = 30,
    retry_max_seconds: int = 86400,
    available_at: datetime | None = None,
) -> tuple[TasklyticCommand, bool]:
    """Insert once per scope/type/deduplication key without committing."""

    if not command_type or len(command_type) > 96:
        raise ValueError("command_type must contain at most 96 characters")
    if not deduplication_key or len(deduplication_key) > 255:
        raise ValueError("deduplication_key must contain at most 255 characters")
    if max_attempts < 1 or max_attempts > 100:
        raise ValueError("max_attempts must be between 1 and 100")
    if retry_base_seconds < 1 or retry_max_seconds < retry_base_seconds:
        raise ValueError("retry delays must be positive and capped above the base delay")
    scope_key = _scope_key(workspace_id, actor_id)
    existing = db.query(TasklyticCommand).filter_by(
        scope_key=scope_key,
        command_type=command_type,
        deduplication_key=deduplication_key,
    ).one_or_none()
    if existing is not None:
        return existing, False
    row = TasklyticCommand(
        workspace_id=workspace_id,
        scope_key=scope_key,
        actor_id=actor_id,
        command_type=command_type,
        deduplication_key=deduplication_key,
        payload=dict(payload or {}),
        max_attempts=max_attempts,
        retry_base_seconds=retry_base_seconds,
        retry_max_seconds=retry_max_seconds,
        available_at=available_at or utcnow(),
    )
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
    except IntegrityError:
        existing = db.query(TasklyticCommand).filter_by(
            scope_key=scope_key,
            command_type=command_type,
            deduplication_key=deduplication_key,
        ).one()
        return existing, False
    return row, True


def _claimable(now: datetime):
    return and_(
        TasklyticCommand.attempt_count < TasklyticCommand.max_attempts,
        TasklyticCommand.available_at <= now,
        or_(
            TasklyticCommand.status.in_(["pending", "retry"]),
            and_(
                TasklyticCommand.status == "leased",
                TasklyticCommand.lease_expires_at <= now,
            ),
        ),
    )


def claim_commands(
    db: Session,
    *,
    worker_id: str,
    limit: int = 25,
    lease_seconds: int = 120,
    now: datetime | None = None,
    command_types: set[str] | frozenset[str] | None = None,
) -> list[TasklyticCommand]:
    """Atomically lease due commands; PostgreSQL workers use SKIP LOCKED."""

    if not worker_id or len(worker_id) > 128:
        raise ValueError("worker_id must contain at most 128 characters")
    now = now or utcnow()
    limit = max(1, min(limit, 100))
    exhausted_query = db.query(TasklyticCommand).filter(
        TasklyticCommand.status == "leased",
        TasklyticCommand.lease_expires_at <= now,
        TasklyticCommand.attempt_count >= TasklyticCommand.max_attempts,
    )
    if command_types is not None:
        exhausted_query = exhausted_query.filter(TasklyticCommand.command_type.in_(command_types))
    exhausted = exhausted_query.all()
    for command in exhausted:
        command.status = "failed"
        command.failure_code = "lease_expired"
        command.failure_detail = "The final worker lease expired before completion"
        command.failure_details = {
            "retryable": False,
            "attempt": command.attempt_count,
            "maxAttempts": command.max_attempts,
        }
        command.lease_owner = None
        command.lease_expires_at = None
        command.completed_at = now
        command.updated_at = now
        run = db.query(TasklyticCommandRun).filter_by(
            command_id=command.id,
            attempt=command.attempt_count,
            status="running",
        ).one_or_none()
        if run:
            run.status = "failed"
            run.failure_code = command.failure_code
            run.failure_detail = command.failure_detail
            run.failure_details = command.failure_details
            run.finished_at = now
    db.flush()
    query = db.query(TasklyticCommand).filter(_claimable(now)).order_by(
        TasklyticCommand.available_at,
        TasklyticCommand.created_at,
    )
    if command_types is not None:
        query = query.filter(TasklyticCommand.command_type.in_(command_types))
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        candidates = query.with_for_update(skip_locked=True).limit(limit).all()
    else:
        candidates = query.limit(limit).all()
    claimed: list[TasklyticCommand] = []
    for candidate in candidates:
        previous_attempt = candidate.attempt_count
        if candidate.status == "leased":
            stale = db.query(TasklyticCommandRun).filter_by(
                command_id=candidate.id,
                attempt=previous_attempt,
                status="running",
            ).one_or_none()
            if stale:
                stale.status = "retry"
                stale.failure_code = "lease_expired"
                stale.failure_detail = "The worker lease expired before completion"
                stale.finished_at = now
        updated = db.query(TasklyticCommand).filter(
            TasklyticCommand.id == candidate.id,
            _claimable(now),
        ).update(
            {
                TasklyticCommand.status: "leased",
                TasklyticCommand.lease_owner: worker_id,
                TasklyticCommand.lease_expires_at: now + timedelta(seconds=max(1, lease_seconds)),
                TasklyticCommand.attempt_count: previous_attempt + 1,
                TasklyticCommand.updated_at: now,
            },
            synchronize_session=False,
        )
        if not updated:
            db.expire(candidate)
            continue
        db.flush()
        db.refresh(candidate)
        db.add(TasklyticCommandRun(
            command_id=candidate.id,
            attempt=candidate.attempt_count,
            worker_id=worker_id,
            status="running",
            started_at=now,
        ))
        claimed.append(candidate)
    db.flush()
    return claimed


def _leased_command(db: Session, command_id: uuid.UUID, worker_id: str) -> TasklyticCommand:
    command = db.get(TasklyticCommand, command_id)
    if command is None:
        raise LookupError("Command not found")
    if command.status != "leased" or command.lease_owner != worker_id:
        raise RuntimeError("Command is not leased by this worker")
    return command


def complete_command(
    db: Session,
    command_id: uuid.UUID,
    *,
    worker_id: str,
    result: Any = None,
    now: datetime | None = None,
) -> TasklyticCommand:
    now = now or utcnow()
    command = _leased_command(db, command_id, worker_id)
    command.status = "succeeded"
    command.result = result
    command.failure_code = None
    command.failure_detail = None
    command.failure_details = None
    command.lease_owner = None
    command.lease_expires_at = None
    command.completed_at = now
    command.updated_at = now
    run = db.query(TasklyticCommandRun).filter_by(
        command_id=command.id,
        attempt=command.attempt_count,
    ).one()
    run.status = "succeeded"
    run.result = result
    run.finished_at = now
    db.flush()
    return command


def fail_command(
    db: Session,
    command_id: uuid.UUID,
    *,
    worker_id: str,
    error: BaseException,
    retry_base_seconds: int | None = None,
    now: datetime | None = None,
) -> TasklyticCommand:
    now = now or utcnow()
    command = _leased_command(db, command_id, worker_id)
    exhausted = command.attempt_count >= command.max_attempts
    code = type(error).__name__[:128]
    detail = str(error)[:8000] or code
    details = {"retryable": not exhausted, "attempt": command.attempt_count, "maxAttempts": command.max_attempts}
    command.status = "failed" if exhausted else "retry"
    command.failure_code = code
    command.failure_detail = detail
    command.failure_details = details
    command.lease_owner = None
    command.lease_expires_at = None
    command.updated_at = now
    if exhausted:
        command.completed_at = now
    else:
        base_delay = retry_base_seconds or command.retry_base_seconds
        delay = max(1, base_delay) * (2 ** max(0, command.attempt_count - 1))
        command.available_at = now + timedelta(seconds=min(delay, command.retry_max_seconds))
    run = db.query(TasklyticCommandRun).filter_by(
        command_id=command.id,
        attempt=command.attempt_count,
    ).one()
    run.status = "failed" if exhausted else "retry"
    run.failure_code = code
    run.failure_detail = detail
    run.failure_details = details
    run.finished_at = now
    db.flush()
    return command


async def execute_claimed_command(
    db: Session,
    command: TasklyticCommand,
    *,
    worker_id: str,
    handlers: dict[str, CommandHandler],
) -> TasklyticCommand:
    handler = handlers.get(command.command_type)
    if handler is None:
        error = LookupError(f"No handler is registered for {command.command_type}")
        return fail_command(db, command.id, worker_id=worker_id, error=error)
    try:
        value = handler(db, command)
        result = await value if inspect.isawaitable(value) else value
        return complete_command(db, command.id, worker_id=worker_id, result=result)
    except Exception as exc:
        db.rollback()
        # The lease and run were committed by the runner before dispatch. Reload
        # them in a clean transaction so failure diagnostics always survive.
        return fail_command(db, command.id, worker_id=worker_id, error=exc)


def execute_inline_command(
    db: Session,
    *,
    command_type: str,
    deduplication_key: str,
    payload: dict[str, Any] | None,
    actor_id: str,
    workspace_id: str | None,
    operation: CommandOperation,
) -> tuple[Any, TasklyticCommand, bool]:
    """Run a multi-record mutation atomically and record its command status."""

    command, created = enqueue_command(
        db,
        command_type=command_type,
        deduplication_key=deduplication_key,
        payload=payload,
        actor_id=actor_id,
        workspace_id=workspace_id,
        max_attempts=1,
    )
    if not created:
        if command.status == "succeeded":
            return command.result, command, True
        raise HTTPException(
            status_code=409,
            detail={"code": "command_in_progress", "commandId": str(command.id), "status": command.status},
        )
    now = utcnow()
    command.status = "leased"
    command.lease_owner = INLINE_WORKER
    command.lease_expires_at = now + timedelta(minutes=5)
    command.attempt_count = 1
    run = TasklyticCommandRun(
        command_id=command.id,
        attempt=1,
        worker_id=INLINE_WORKER,
        status="running",
        started_at=now,
    )
    db.add(run)
    db.flush()
    try:
        with db.begin_nested():
            result = operation()
            db.flush()
    except Exception as exc:
        command.status = "failed"
        command.failure_code = type(exc).__name__[:128]
        command.failure_detail = (str(exc) or type(exc).__name__)[:8000]
        command.failure_details = {"retryable": False, "attempt": 1, "maxAttempts": 1}
        command.lease_owner = None
        command.lease_expires_at = None
        command.completed_at = utcnow()
        run.status = "failed"
        run.failure_code = command.failure_code
        run.failure_detail = command.failure_detail
        run.failure_details = command.failure_details
        run.finished_at = command.completed_at
        db.flush()
        raise
    command.status = "succeeded"
    command.result = result
    command.lease_owner = None
    command.lease_expires_at = None
    command.completed_at = utcnow()
    command.updated_at = command.completed_at
    run.status = "succeeded"
    run.result = result
    run.finished_at = command.completed_at
    db.flush()
    return result, command, False


def retry_failed_command(db: Session, command: TasklyticCommand) -> TasklyticCommand:
    if command.status != "failed":
        raise HTTPException(status_code=409, detail="Only exhausted commands can be retried")
    if not command.command_type.startswith("maintenance."):
        raise HTTPException(status_code=409, detail="Transactional request commands cannot be replayed as background jobs")
    command.max_attempts = command.attempt_count + max(1, command.max_attempts)
    command.status = "retry"
    command.available_at = utcnow()
    command.completed_at = None
    command.failure_details = {
        **dict(command.failure_details or {}),
        "manualRetryRequested": True,
    }
    command.updated_at = utcnow()
    db.flush()
    return command


def mutation_command_type(
    entity_kind: str,
    payload: dict[str, Any],
    previous: dict[str, Any] | None,
) -> str | None:
    """Enforce one command seam for current and future sensitive workflows."""

    if entity_kind == "workspaces":
        return "domain.workspace.update"
    if entity_kind == "rules":
        return "domain.rule.execute"
    before_status = (previous or {}).get("status")
    after_status = payload.get("status")
    if after_status in {"approved", "rejected", "partially_approved"} and after_status != before_status:
        return "domain.approval.execute"
    if after_status in {"locked", "written_off", "reimbursed"} and after_status != before_status:
        return "domain.lock.execute"
    if entity_kind == "invoices":
        return "domain.invoice.execute"
    if entity_kind == "payments":
        return "domain.payment.execute"
    return None


def command_payload(command: TasklyticCommand, *, include_payload: bool = False) -> dict[str, Any]:
    result = {
        "id": str(command.id),
        "workspaceId": command.workspace_id,
        "actorId": command.actor_id,
        "type": command.command_type,
        "deduplicationKey": command.deduplication_key,
        "status": command.status,
        "attemptCount": command.attempt_count,
        "maxAttempts": command.max_attempts,
        "retryPolicy": {
            "strategy": "exponential",
            "baseSeconds": command.retry_base_seconds,
            "maxSeconds": command.retry_max_seconds,
        },
        "availableAt": command.available_at.isoformat() if command.available_at else None,
        "leaseOwner": command.lease_owner,
        "leaseExpiresAt": command.lease_expires_at.isoformat() if command.lease_expires_at else None,
        "failure": None if not command.failure_code else {
            "code": command.failure_code,
            "detail": command.failure_detail,
            "details": command.failure_details,
        },
        "result": command.result,
        "createdAt": command.created_at.isoformat() if command.created_at else None,
        "updatedAt": command.updated_at.isoformat() if command.updated_at else None,
        "completedAt": command.completed_at.isoformat() if command.completed_at else None,
    }
    if include_payload:
        result["payload"] = command.payload
    return result


def command_run_payload(run: TasklyticCommandRun) -> dict[str, Any]:
    return {
        "id": str(run.id),
        "attempt": run.attempt,
        "workerId": run.worker_id,
        "status": run.status,
        "result": run.result,
        "failure": None if not run.failure_code else {
            "code": run.failure_code,
            "detail": run.failure_detail,
            "details": run.failure_details,
        },
        "startedAt": run.started_at.isoformat() if run.started_at else None,
        "finishedAt": run.finished_at.isoformat() if run.finished_at else None,
    }
