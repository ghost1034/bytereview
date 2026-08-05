"""Managed Hermes cron provider and delivery platform for Hosted Claw."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sqlite3
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from cron.scheduler_provider import CronScheduler

logger = logging.getLogger("cron.cpaa_hosted")

_WORKDIR = "/opt/data/workspace"
_DELIVERY = "cpaa-hosted"
_ACTIVE_OCCURRENCE_ENV = "CPAA_HOSTED_CRON_OCCURRENCE_ID"


def _proxy_url() -> str:
    return os.getenv("CPAA_HOSTED_PROXY_URL", "").rstrip("/")


def _request(path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{_proxy_url()}{path}"
    body = json.dumps(payload or {}, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read(1024 * 1024).decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"Hosted cron bridge returned HTTP {exc.code}") from exc


def _native_state(job: dict[str, Any]) -> str:
    state = str(job.get("state") or "").lower()
    if state == "completed":
        return "completed"
    if state == "paused" or not bool(job.get("enabled", True)):
        return "paused"
    return "scheduled"


def _snapshot() -> list[dict[str, Any]]:
    from cron.jobs import list_jobs

    return [
        {
            "native_job_id": str(job["id"]),
            "state": _native_state(job),
            "next_fire_at": job.get("next_run_at"),
        }
        for job in list_jobs(include_disabled=True)
    ]


def _sync(*, manual_job_id: str | None = None, manual_request_id: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {"schedules": _snapshot()}
    if manual_job_id:
        payload["manual_job_id"] = manual_job_id
        payload["manual_request_id"] = manual_request_id or uuid.uuid4().hex
    return _request("/api/hosted-claw/runtime/cron/schedules/reconcile", payload)


def _policy_block(message: str) -> dict[str, str]:
    return {"action": "block", "message": message}


def pre_tool_call(tool_name: str, args: dict, task_id: str = "", **kwargs):
    """Enforce the Hosted Claw v1 cron shape before native persistence."""
    if tool_name != "cronjob" or not isinstance(args, dict):
        return None
    action = str(args.get("action") or "").strip().lower()
    forbidden = {
        "script": "script-backed jobs are not available in Hosted Claw",
        "model": "per-job model overrides are not available in Hosted Claw",
        "provider": "per-job provider overrides are not available in Hosted Claw",
        "base_url": "per-job provider URLs are not available in Hosted Claw",
        "profile": "profile overrides are not available in Hosted Claw",
        "profile_id": "profile overrides are not available in Hosted Claw",
        "enabled_toolsets": "per-job toolset overrides are not available in Hosted Claw",
    }
    for key, reason in forbidden.items():
        if args.get(key) not in (None, "", []):
            return _policy_block(reason)
    if args.get("no_agent") is True:
        return _policy_block("no-agent jobs are not available in Hosted Claw")
    if action == "create":
        if args.get("deliver") != _DELIVERY:
            return _policy_block('Hosted Claw cron creation requires deliver="cpaa-hosted"')
        if args.get("workdir") != _WORKDIR:
            return _policy_block(f'Hosted Claw cron creation requires workdir="{_WORKDIR}"')
    if action == "update":
        if "deliver" in args and args.get("deliver") != _DELIVERY:
            return _policy_block("Hosted Claw cron delivery cannot be changed")
        if "workdir" in args and args.get("workdir") != _WORKDIR:
            return _policy_block("Hosted Claw cron workdir cannot be changed")
    if action in {"run", "run_now", "trigger"}:
        from cron.jobs import resolve_job_ref

        job = resolve_job_ref(str(args.get("job_id") or ""))
        if not job:
            return None
        if not job.get("enabled", True) or job.get("state") == "paused":
            return None
        invocation_id = (
            kwargs.get("tool_call_id")
            or kwargs.get("api_request_id")
            or task_id
            or uuid.uuid4().hex
        )
        request_seed = f"{invocation_id}:{job['id']}"
        request_id = hashlib.sha256(request_seed.encode("utf-8")).hexdigest()
        try:
            result = _sync(manual_job_id=str(job["id"]), manual_request_id=request_id)
        except Exception:
            logger.warning("Hosted manual cron queueing failed", exc_info=True)
            return _policy_block("Hosted Claw could not safely queue this manual run. Try again shortly.")
        queued = result.get("queued_occurrence_ids") or []
        if not queued:
            return _policy_block("The manual scheduled run was already queued.")
        return _policy_block("The manual scheduled run was queued through Hosted Claw and will execute shortly.")
    return None


def _prune_local_history() -> None:
    """Retain native cron outputs and terminal execution history for 30 days."""
    try:
        from hermes_constants import get_hermes_home

        cron_dir = get_hermes_home().resolve() / "cron"
        cutoff_epoch = time.time() - (30 * 86400)
        output_dir = cron_dir / "output"
        if output_dir.exists():
            for path in output_dir.rglob("*"):
                if path.is_file() and path.stat().st_mtime < cutoff_epoch:
                    path.unlink(missing_ok=True)
            for path in sorted(output_dir.rglob("*"), reverse=True):
                if path.is_dir():
                    try:
                        path.rmdir()
                    except OSError:
                        pass
        ledger = cron_dir / "executions.db"
        if ledger.exists():
            cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
            with sqlite3.connect(ledger, timeout=5) as conn:
                conn.execute(
                    "DELETE FROM executions WHERE status IN ('completed','failed','unknown') AND finished_at < ?",
                    (cutoff,),
                )
    except Exception:
        logger.warning("Hosted cron local retention failed", exc_info=True)


class CpaaHostedCronScheduler(CronScheduler):
    @property
    def name(self) -> str:
        return _DELIVERY

    def is_available(self) -> bool:
        # Never invite Hermes to fall back to its in-process ticker. Runtime
        # misconfiguration must fail closed in start().
        return True

    def start(self, stop_event, *, adapters=None, loop=None, interval=60):
        if not _proxy_url():
            raise RuntimeError("CPAA_HOSTED_PROXY_URL is required for managed cron")
        if os.getenv("HOSTED_CLAW_CRON_ENABLED", "false").strip().lower() not in {
            "1", "true", "yes", "on",
        }:
            # The provider stays selected to prevent the built-in ticker from
            # firing schedules retained on disk while the kill switch is off.
            stop_event.wait()
            return
        self.recover_interrupted()
        _prune_local_history()
        try:
            self.reconcile()
        except Exception:
            logger.warning("Hosted cron startup reconciliation failed", exc_info=True)
        while not stop_event.is_set():
            try:
                claimed = _request("/api/hosted-claw/runtime/cron/occurrences/claim")
                occurrence = claimed.get("occurrence")
                if occurrence:
                    self._fire_occurrence(occurrence, adapters=adapters, loop=loop)
                    continue
            except Exception:
                logger.warning("Hosted cron occurrence poll failed", exc_info=True)
            stop_event.wait(2)

    def _fire_occurrence(self, occurrence: dict[str, Any], *, adapters=None, loop=None) -> None:
        occurrence_id = str(occurrence["occurrence_id"])
        native_job_id = str(occurrence["native_job_id"])
        heartbeat_stop = threading.Event()

        def heartbeat() -> None:
            while not heartbeat_stop.wait(30):
                try:
                    _request(f"/api/hosted-claw/runtime/cron/occurrences/{occurrence_id}/heartbeat")
                except Exception:
                    logger.warning("Hosted cron heartbeat failed occurrence_id=%s", occurrence_id)

        thread = threading.Thread(target=heartbeat, daemon=True, name="cpaa-hosted-cron-heartbeat")
        # General-plugin and cron-provider discovery load separate module
        # instances. A process-local environment value safely bridges the
        # opaque ID between them without persisting tenant content.
        os.environ[_ACTIVE_OCCURRENCE_ENV] = occurrence_id
        thread.start()
        status = "failed"
        error_code = None
        try:
            fired = super().fire_due(native_job_id, adapters=adapters, loop=loop)
            if not fired:
                error_code = "native_claim_lost"
            else:
                from cron.executions import latest_execution

                native_execution = latest_execution(native_job_id) or {}
                if native_execution.get("status") == "completed":
                    status = "completed"
                elif native_execution.get("status") == "failed":
                    error_code = "native_execution_failed"
                    # Hermes normally delivers a summarized agent failure. If
                    # it failed before reaching delivery, this at-most-once
                    # fallback supplies a generic user-visible failure instead.
                    try:
                        _request(
                            "/api/hosted-claw/runtime/cron/deliver",
                            {
                                "occurrence_id": occurrence_id,
                                "text": (
                                    "Your scheduled Hosted Claw job failed. "
                                    "Ask Hosted Claw to list scheduled jobs and inspect its native history."
                                ),
                            },
                        )
                    except Exception:
                        logger.warning(
                            "Hosted cron failure fallback delivery failed occurrence_id=%s",
                            occurrence_id,
                        )
                else:
                    error_code = "native_execution_status_unknown"
        except Exception:
            error_code = "native_execution_failed"
            logger.exception("Hosted native cron execution failed occurrence_id=%s", occurrence_id)
        finally:
            heartbeat_stop.set()
            thread.join(timeout=2)
            try:
                self.reconcile()
            except Exception:
                logger.warning("Hosted cron post-fire reconciliation failed", exc_info=True)
            try:
                _request(
                    f"/api/hosted-claw/runtime/cron/occurrences/{occurrence_id}/complete",
                    {"status": status, "error_code": error_code},
                )
            finally:
                if os.getenv(_ACTIVE_OCCURRENCE_ENV) == occurrence_id:
                    os.environ.pop(_ACTIVE_OCCURRENCE_ENV, None)
            _prune_local_history()

    def on_jobs_changed(self) -> None:
        try:
            self.reconcile()
        except Exception:
            logger.warning("Hosted cron schedule synchronization failed", exc_info=True)

    def reconcile(self) -> None:
        _sync()


async def _standalone_send(
    pconfig,
    chat_id,
    message,
    *,
    thread_id=None,
    media_files=None,
    force_document=False,
    caption=None,
):
    """Outbound-only text delivery through the tenant proxy."""
    del pconfig, chat_id, thread_id, media_files, force_document, caption
    occurrence_id = os.getenv(_ACTIVE_OCCURRENCE_ENV, "")
    if not occurrence_id:
        return {"error": "No active Hosted Claw cron occurrence"}
    try:
        result = await asyncio.to_thread(
            _request,
            "/api/hosted-claw/runtime/cron/deliver",
            {"occurrence_id": occurrence_id, "text": str(message)},
        )
    except Exception as exc:
        return {"error": str(exc)}
    return result if result.get("success") else {"error": "Hosted cron delivery failed"}


def register(ctx) -> None:
    ctx.register_hook("pre_tool_call", pre_tool_call)
    ctx.register_platform(
        name=_DELIVERY,
        label="CPAAutomation Hosted Delivery",
        adapter_factory=lambda config: None,
        check_fn=lambda: False,
        validate_config=lambda config: True,
        cron_deliver_env_var="CPAA_HOSTED_HOME_CHANNEL",
        standalone_sender_fn=_standalone_send,
        max_message_length=0,
        allow_update_command=False,
    )
    register_scheduler = getattr(ctx, "register_cron_scheduler", None)
    if callable(register_scheduler):
        register_scheduler(CpaaHostedCronScheduler())
