from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import sys
import tempfile
import types
import unittest
import zipfile
from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi import HTTPException

from services.hosted_claw_security import (
    HostedClawUnavailable,
    KmsEnvelope,
    approval_argument_hash,
    canonical_arguments,
    one_time_record_is_valid,
    verify_slack_signature,
)
from services.hosted_claw_service import (
    action_is_read_only,
    managed_hermes_config,
    publish_job,
    validate_attachment,
)
from services.hosted_claw_cron import reconcile_schedules, recover_expired_occurrences
from models.db_models import HostedClawCronOccurrence, HostedClawCronSchedule
from routes.connector import _handle_mcp_message
from routes.hosted_claw import (
    _ensure_hermes_session_id,
    _link_oauth_installer,
    _runtime_start_expected,
    _supported_slack_message_event,
    _valid_slack_file_url,
    deliver_runtime_cron_text,
    mark_job_started,
    post_job_progress,
    runtime_stopped,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT))
try:
    from hosted_claw.supervisor import (
        EVENT_INACTIVITY_SECONDS,
        HermesSlackActionProgress,
        IDLE_SECONDS,
        MAX_RESIDENT_RUNTIMES,
        MAX_TURNS,
        TURN_TIMEOUT_SECONDS,
        DockerRuntimeManager,
        HermesEventInactivityTimeout,
        HermesRuns,
        HostedTurnTimeout,
        Runtime,
        Supervisor,
    )
finally:
    sys.path.pop(0)

_PLUGIN_SPEC = spec_from_file_location(
    "_hosted_policy_plugin",
    Path(__file__).resolve().parents[2] / "hosted_claw" / "plugin" / "__init__.py",
)
assert _PLUGIN_SPEC is not None and _PLUGIN_SPEC.loader is not None
_PLUGIN = module_from_spec(_PLUGIN_SPEC)
_PLUGIN_SPEC.loader.exec_module(_PLUGIN)

_ARTIFACTS_SPEC = spec_from_file_location(
    "_hosted_artifacts",
    Path(__file__).resolve().parents[2] / "hosted_claw" / "artifacts.py",
)
assert _ARTIFACTS_SPEC is not None and _ARTIFACTS_SPEC.loader is not None
_ARTIFACTS = module_from_spec(_ARTIFACTS_SPEC)
_ARTIFACTS_SPEC.loader.exec_module(_ARTIFACTS)


class HostedSlackSignatureTests(unittest.TestCase):
    def test_valid_signature_and_five_minute_window(self) -> None:
        body = b'{"type":"event_callback"}'
        timestamp = "1700000000"
        signature = "v0=" + hmac.new(
            b"secret", b"v0:" + timestamp.encode() + b":" + body, hashlib.sha256
        ).hexdigest()
        self.assertTrue(verify_slack_signature(body, timestamp, signature, "secret", now=1700000300))
        self.assertFalse(verify_slack_signature(body, timestamp, signature, "secret", now=1700000301))
        self.assertFalse(verify_slack_signature(body + b"x", timestamp, signature, "secret", now=1700000000))


class HostedSlackMessageEventTests(unittest.TestCase):
    def test_accepts_plain_and_file_share_direct_messages(self) -> None:
        base = {"type": "message", "channel_type": "im", "user": "U123"}

        self.assertTrue(_supported_slack_message_event(base))
        self.assertTrue(
            _supported_slack_message_event(
                {
                    **base,
                    "subtype": "file_share",
                    "files": [{"id": "F123", "name": "invoices.zip"}],
                }
            )
        )

    def test_rejects_non_dm_bot_and_mutating_message_subtypes(self) -> None:
        base = {"type": "message", "channel_type": "im", "user": "U123"}
        cases = [
            {**base, "channel_type": "channel"},
            {**base, "bot_id": "B123"},
            {**base, "subtype": "message_changed"},
            {**base, "subtype": "message_deleted"},
        ]

        for event in cases:
            with self.subTest(event=event):
                self.assertFalse(_supported_slack_message_event(event))


class HostedArtifactScannerTests(unittest.TestCase):
    def test_scans_through_bounded_clamav_stream(self) -> None:
        with self.subTest("clean"):
            with patch.object(
                _ARTIFACTS.subprocess,
                "run",
                return_value=SimpleNamespace(returncode=0),
            ) as run:
                with unittest.mock.patch.object(Path, "lstat", return_value=SimpleNamespace(st_size=4)):
                    with unittest.mock.patch.object(Path, "is_symlink", return_value=False):
                        with unittest.mock.patch.object(Path, "is_file", return_value=True):
                            _ARTIFACTS.scan_with_clamav(Path("/srv/hosted-claw/clean.txt"))
            self.assertEqual(
                run.call_args.args[0],
                [
                    "clamdscan",
                    "--stream",
                    "--no-summary",
                    "/srv/hosted-claw/clean.txt",
                ],
            )

        with self.subTest("scanner failure is fail-closed"):
            with patch.object(
                _ARTIFACTS.subprocess,
                "run",
                return_value=SimpleNamespace(returncode=2),
            ):
                with unittest.mock.patch.object(Path, "lstat", return_value=SimpleNamespace(st_size=4)):
                    with unittest.mock.patch.object(Path, "is_symlink", return_value=False):
                        with unittest.mock.patch.object(Path, "is_file", return_value=True):
                            with self.assertRaises(_ARTIFACTS.UnsafeArtifact):
                                _ARTIFACTS.scan_with_clamav(Path("/srv/hosted-claw/error.txt"))


class HostedRuntimeReadinessTests(unittest.TestCase):
    def test_tenant_network_supports_direct_outbound_uploads(self) -> None:
        manager = DockerRuntimeManager()
        manager._docker = MagicMock(
            side_effect=[
                SimpleNamespace(returncode=1, stdout=""),
                SimpleNamespace(returncode=0, stdout=""),
            ]
        )

        manager.ensure_network("tenant-network", internal=False)

        manager._docker.assert_any_call(
            "network",
            "inspect",
            "--format",
            "{{.Internal}}",
            "tenant-network",
            check=False,
        )
        manager._docker.assert_any_call("network", "create", "tenant-network")
        create_call = manager._docker.call_args_list[1]
        self.assertNotIn("--internal", create_call.args)

    def test_stale_internal_tenant_network_is_recreated(self) -> None:
        manager = DockerRuntimeManager()
        manager._docker = MagicMock(
            side_effect=[
                SimpleNamespace(returncode=0, stdout="true\n"),
                SimpleNamespace(returncode=0, stdout=""),
                SimpleNamespace(returncode=0, stdout=""),
                SimpleNamespace(returncode=0, stdout=""),
                SimpleNamespace(returncode=0, stdout=""),
            ]
        )

        manager.ensure_network(
            "tenant-network",
            internal=False,
            replace_containers=("tenant", "proxy"),
        )

        self.assertEqual(
            manager._docker.call_args_list[1:],
            [
                unittest.mock.call("rm", "--force", "tenant", check=False),
                unittest.mock.call("rm", "--force", "proxy", check=False),
                unittest.mock.call("network", "rm", "tenant-network"),
                unittest.mock.call("network", "create", "tenant-network"),
            ],
        )

    def test_managed_workspace_is_writable_by_tenant_uid(self) -> None:
        manager = DockerRuntimeManager()
        config = {
            "active_product": "accountingclaw",
            "model_alias": "claw-default",
            "timezone": "UTC",
            "memory_enabled": True,
        }
        with tempfile.TemporaryDirectory() as directory, patch(
            "hosted_claw.supervisor.os.chown"
        ) as chown:
            data_dir = Path(directory) / "tenant"
            manager._write_config(data_dir, config, "http://connector", "http://model")

        self.assertIn(
            (data_dir / "workspace", 65532, 65532),
            [call.args for call in chown.call_args_list],
        )

    def test_docker_failure_does_not_expose_command_arguments(self) -> None:
        manager = DockerRuntimeManager()
        with patch(
            "hosted_claw.supervisor.subprocess.run",
            return_value=SimpleNamespace(returncode=125, stdout="", stderr="failure"),
        ):
            with self.assertRaises(RuntimeError) as raised:
                manager._docker("run", "--env", "CONNECTOR_TOKEN=do-not-log", "image")

        self.assertEqual(str(raised.exception), "Docker run operation failed with exit code 125")
        self.assertNotIn("do-not-log", str(raised.exception))

    def test_waits_for_hermes_api_after_container_starts(self) -> None:
        manager = DockerRuntimeManager()
        manager._docker = MagicMock(return_value=SimpleNamespace(returncode=0, stdout="true\n"))
        connection = MagicMock()
        with patch("hosted_claw.supervisor.socket.create_connection", side_effect=[OSError(), connection]), patch(
            "hosted_claw.supervisor.time.sleep"
        ) as sleep:
            manager._wait_for_api("tenant", "172.18.0.3")

        self.assertEqual(sleep.call_count, 1)
        self.assertEqual(connection.__enter__.call_count, 1)

    def test_fails_when_runtime_exits_before_listening(self) -> None:
        manager = DockerRuntimeManager()
        manager._docker = MagicMock(return_value=SimpleNamespace(returncode=0, stdout="false\n"))
        with patch("hosted_claw.supervisor.socket.create_connection") as connect:
            with self.assertRaisesRegex(RuntimeError, "exited before its API became ready"):
                manager._wait_for_api("tenant", "172.18.0.3")
        connect.assert_not_called()


class HostedGeneratedArtifactDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_explicit_generated_artifact_is_still_delivered_to_slack(self) -> None:
        supervisor = Supervisor.__new__(Supervisor)
        supervisor.worker_id = "worker-a"
        supervisor.control = SimpleNamespace(
            request=AsyncMock(
                side_effect=[
                    {"artifact_id": "artifact-a", "upload_url": "https://upload.example"},
                    {"ok": True},
                    {"ok": True},
                ]
            )
        )
        client = MagicMock()
        upload_response = MagicMock()
        client.put = AsyncMock(return_value=upload_response)
        client_context = MagicMock()
        client_context.__aenter__ = AsyncMock(return_value=client)
        client_context.__aexit__ = AsyncMock(return_value=False)

        with tempfile.TemporaryDirectory() as directory:
            data_dir = Path(directory)
            workspace = data_dir / "workspace"
            workspace.mkdir()
            artifact_path = workspace / "report.csv"
            artifact_path.write_text("account,balance\nCash,100\n", encoding="utf-8")
            runtime = SimpleNamespace(data_dir=data_dir)
            job = {"user_id": "user-a", "job_id": "job-a"}

            with patch(
                "hosted_claw.supervisor.promote_clean_file",
                return_value=artifact_path,
            ), patch(
                "hosted_claw.supervisor.httpx.AsyncClient",
                return_value=client_context,
            ):
                delivered = await supervisor._deliver_generated_artifact(
                    job,
                    runtime,
                    artifact_path,
                    "text/csv",
                )

        self.assertEqual(delivered, artifact_path.resolve())
        self.assertEqual(
            supervisor.control.request.await_args_list,
            [
                unittest.mock.call(
                    "POST",
                    "/api/internal/hosted-claw/artifacts?worker_id=worker-a",
                    json={
                        "user_id": "user-a",
                        "job_id": "job-a",
                        "direction": "outbound",
                        "filename": "report.csv",
                        "content_type": "text/csv",
                        "size_bytes": 25,
                    },
                ),
                unittest.mock.call(
                    "POST",
                    "/api/internal/hosted-claw/artifacts/artifact-a/scan?worker_id=worker-a",
                    json={"status": "clean"},
                ),
                unittest.mock.call(
                    "POST",
                    "/api/internal/hosted-claw/artifacts/artifact-a/deliver?worker_id=worker-a",
                ),
            ],
        )
        client.put.assert_awaited_once()
        upload_response.raise_for_status.assert_called_once_with()


class HostedRuntimeCapacityTests(unittest.TestCase):
    @staticmethod
    def runtime(runtime_id: str, last_activity: float) -> Runtime:
        return Runtime(
            runtime_id=runtime_id,
            user_id=f"user-{runtime_id}",
            product="accountingclaw",
            container_name=f"tenant-{runtime_id}",
            proxy_name=f"proxy-{runtime_id}",
            network_name=f"network-{runtime_id}",
            data_dir=Path(f"/tmp/{runtime_id}"),
            api_key="key",
            api_url="http://runtime",
            config_revision=1,
            model_alias="claw-default",
            last_activity=last_activity,
            cold_started=False,
        )

    def test_defaults_allow_three_turns_and_three_warm_runtimes(self) -> None:
        self.assertEqual(MAX_TURNS, 3)
        self.assertEqual(MAX_RESIDENT_RUNTIMES, 3)
        self.assertEqual(IDLE_SECONDS, 300)
        self.assertEqual(TURN_TIMEOUT_SECONDS, 600)
        self.assertEqual(EVENT_INACTIVITY_SECONDS, 120)

    def test_new_tenant_evicts_the_least_recent_idle_runtime(self) -> None:
        manager = DockerRuntimeManager()
        manager.runtimes["old"] = self.runtime("old", 10)
        for index in range(1, MAX_RESIDENT_RUNTIMES):
            runtime_id = f"warm-{index}"
            manager.runtimes[runtime_id] = self.runtime(runtime_id, 10 + index)

        with patch.object(manager, "stop_runtime", side_effect=manager.runtimes.pop) as stop:
            evicted = manager.evict_for("new", {"new"})

        self.assertEqual(evicted, ["old"])
        stop.assert_called_once_with("old")

    def test_existing_warm_runtime_is_reused_without_eviction(self) -> None:
        manager = DockerRuntimeManager()
        manager.runtimes["same"] = self.runtime("same", 10)

        with patch.object(manager, "stop_runtime") as stop:
            self.assertEqual(manager.evict_for("same", {"same"}), [])

        stop.assert_not_called()

    def test_active_runtime_is_never_evicted(self) -> None:
        manager = DockerRuntimeManager()
        active_ids = {f"active-{index}" for index in range(MAX_RESIDENT_RUNTIMES)}
        for runtime_id in active_ids:
            manager.runtimes[runtime_id] = self.runtime(runtime_id, 10)

        with self.assertRaisesRegex(RuntimeError, "No idle Hosted Claw runtime"):
            manager.evict_for("new", active_ids | {"new"})

    def test_idle_sweeper_does_not_stop_an_active_runtime(self) -> None:
        manager = DockerRuntimeManager()
        manager.runtimes["active"] = self.runtime("active", 0)
        manager.runtimes["idle"] = self.runtime("idle", 0)

        with patch("hosted_claw.supervisor.time.monotonic", return_value=IDLE_SECONDS + 1), patch.object(
            manager, "stop_runtime", side_effect=manager.runtimes.pop
        ) as stop:
            stopped = manager.stop_idle({"active"})

        self.assertEqual(stopped, ["idle"])
        stop.assert_called_once_with("idle")


class HostedRuntimeStopTests(unittest.IsolatedAsyncioTestCase):
    async def test_stop_acknowledgement_clears_runtime_instance(self) -> None:
        db = MagicMock()
        session = SimpleNamespace(status="stopped", worker_id="worker-a", runtime_id="runtime-a")
        session_query = MagicMock()
        session_query.filter.return_value.first.return_value = session
        token_query = MagicMock()
        db.query.side_effect = [session_query, token_query]

        await runtime_stopped("runtime-a", "worker-a", db)

        self.assertEqual(session.status, "stopped")
        self.assertIsNone(session.worker_id)
        self.assertIsNone(session.runtime_id)
        token_query.filter.return_value.update.assert_called_once()
        db.commit.assert_called_once_with()


class HostedSlackProgressTests(unittest.IsolatedAsyncioTestCase):
    async def test_status_is_posted_immediately_with_neutral_copy(self) -> None:
        supervisor = Supervisor.__new__(Supervisor)
        supervisor.worker_id = "worker-a"
        supervisor.control = SimpleNamespace(request=AsyncMock(return_value={"ok": True}))
        request_started = asyncio.Event()

        with patch("hosted_claw.supervisor.asyncio.sleep", new=AsyncMock()) as sleep:
            await supervisor._post_turn_status("job-a", request_started)

        sleep.assert_not_awaited()
        self.assertTrue(request_started.is_set())
        supervisor.control.request.assert_awaited_once_with(
            "POST",
            "/api/internal/hosted-claw/jobs/job-a/progress?worker_id=worker-a",
            json={"kind": "status", "text": "Working on it…"},
        )

    async def test_native_tool_events_render_as_coalesced_slack_actions(self) -> None:
        supervisor = SimpleNamespace(
            worker_id="worker-a",
            control=SimpleNamespace(request=AsyncMock(return_value={"ok": True})),
        )
        progress = HermesSlackActionProgress(supervisor, "job-a")

        with patch("hosted_claw.supervisor.ACTION_PROGRESS_MIN_INTERVAL_SECONDS", 0):
            await progress.record(
                {
                    "type": "tool.started",
                    "tool_name": "web_search",
                    "preview": "Search for <quarterly results>",
                }
            )
            await progress.record(
                {"type": "tool.completed", "tool_name": "web_search"}
            )
            await progress.record(
                {
                    "type": "tool.started",
                    "tool_name": "terminal",
                    "preview": "Run reconciliation.py",
                }
            )
        await progress.close()

        last_update = supervisor.control.request.await_args_list[-1]
        self.assertEqual(
            last_update.args,
            (
                "POST",
                "/api/internal/hosted-claw/jobs/job-a/progress?worker_id=worker-a",
            ),
        )
        self.assertEqual(last_update.kwargs["json"]["kind"], "status")
        self.assertEqual(
            last_update.kwargs["json"]["text"],
            "Working on it…\n\n*Actions*\n"
            "• ✅ Web search — Search for &lt;quarterly results&gt;\n"
            "• ⏳ Terminal — Run reconciliation.py",
        )

    async def test_reasoning_progress_is_not_shown_in_slack(self) -> None:
        supervisor = SimpleNamespace(
            worker_id="worker-a",
            control=SimpleNamespace(request=AsyncMock(return_value={"ok": True})),
        )
        progress = HermesSlackActionProgress(supervisor, "job-a")

        await progress.record(
            {
                "type": "tool.progress",
                "tool_name": "_thinking",
                "delta": "private model reasoning",
            }
        )
        await progress.close()

        supervisor.control.request.assert_not_awaited()

    async def test_job_starts_only_after_runtime_is_ready(self) -> None:
        job = SimpleNamespace(
            id="job-a",
            worker_id="worker-a",
            status="claimed",
            user_id="user-a",
            product="accountingclaw",
        )
        job_query = MagicMock()
        job_query.filter.return_value.first.return_value = job
        session_query = MagicMock()
        db = MagicMock()
        db.query.side_effect = [job_query, session_query]

        await mark_job_started("job-a", "worker-a", db)

        self.assertEqual(job.status, "running")
        update = session_query.filter.return_value.update
        update.assert_called_once()
        self.assertEqual(list(update.call_args.args[0].values()), ["running"])
        self.assertEqual(update.call_args.kwargs, {"synchronize_session": False})
        job_query.filter.return_value.with_for_update.assert_not_called()
        db.commit.assert_called_once_with()

    async def test_final_response_updates_existing_placeholder(self) -> None:
        job = SimpleNamespace(
            id="job-a",
            worker_id="worker-a",
            status="claimed",
            slack_link_id="link-a",
            slack_response_ts=None,
            slack_response_finalized_at=None,
            payload_ciphertext=b"encrypted",
            event_id="event-a",
            kms_key_version="key-a",
            user_id="user-a",
            product="accountingclaw",
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = job
        link = SimpleNamespace(installation_id="installation-a")
        installation = SimpleNamespace(id="installation-a")
        db.get.side_effect = [link, installation, link, installation]
        status_request = MagicMock()
        status_request.json = AsyncMock(
            return_value={"kind": "status", "text": "Working on it…"}
        )
        final_request = MagicMock()
        final_request.json = AsyncMock(
            return_value={
                "kind": "final",
                "text": "## The answer\n\n**Total:** [report](https://example.com/report)",
            }
        )

        with patch(
            "routes.hosted_claw.KmsEnvelope.decrypt",
            return_value=b'{"channel_id":"D123","thread_ts":"100.001"}',
        ), patch(
            "routes.hosted_claw.slack_api",
            new=AsyncMock(side_effect=[{"ok": True, "ts": "101.002"}, {"ok": True}]),
        ) as slack:
            await post_job_progress("job-a", "worker-a", status_request, db)
            await post_job_progress("job-a", "worker-a", final_request, db)
            late_status = await post_job_progress("job-a", "worker-a", status_request, db)

        self.assertEqual(job.slack_response_ts, "101.002")
        self.assertIsNotNone(job.slack_response_finalized_at)
        self.assertEqual(late_status.message, "Final response already delivered.")
        self.assertEqual(slack.await_count, 2)
        self.assertEqual(slack.await_args_list[0].args[1:], (
            "chat.postMessage",
            {"channel": "D123", "thread_ts": "100.001", "text": "Working on it…"},
        ))
        self.assertEqual(slack.await_args_list[1].args[1:], (
            "chat.update",
            {
                "channel": "D123",
                "ts": "101.002",
                "markdown_text": "## The answer\n\n**Total:** [report](https://example.com/report)",
            },
        ))

    async def test_final_response_posts_standard_markdown_without_placeholder(self) -> None:
        job = SimpleNamespace(
            id="job-a",
            worker_id="worker-a",
            status="running",
            slack_link_id="link-a",
            slack_response_ts=None,
            slack_response_finalized_at=None,
            payload_ciphertext=b"encrypted",
            event_id="event-a",
            kms_key_version="key-a",
            user_id="user-a",
            product="accountingclaw",
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = job
        link = SimpleNamespace(installation_id="installation-a")
        installation = SimpleNamespace(id="installation-a")
        db.get.side_effect = [link, installation]
        request = MagicMock()
        request.json = AsyncMock(return_value={"kind": "final", "text": "**Done**"})

        with patch(
            "routes.hosted_claw.KmsEnvelope.decrypt",
            return_value=b'{"channel_id":"D123","thread_ts":"100.001"}',
        ), patch(
            "routes.hosted_claw.slack_api",
            new=AsyncMock(return_value={"ok": True, "ts": "101.002"}),
        ) as slack:
            await post_job_progress("job-a", "worker-a", request, db)

        self.assertEqual(slack.await_args.args[1:], (
            "chat.postMessage",
            {
                "channel": "D123",
                "thread_ts": "100.001",
                "markdown_text": "**Done**",
            },
        ))
        self.assertEqual(job.slack_response_ts, "101.002")
        self.assertIsNotNone(job.slack_response_finalized_at)

    async def test_concurrent_progress_waits_without_blocking_the_event_loop(self) -> None:
        job = SimpleNamespace(
            id="job-concurrent",
            worker_id="worker-a",
            status="running",
            slack_link_id="link-a",
            slack_response_ts=None,
            slack_response_finalized_at=None,
            payload_ciphertext=b"encrypted",
            event_id="event-a",
            kms_key_version="key-a",
            user_id="user-a",
            product="accountingclaw",
        )
        link = SimpleNamespace(installation_id="installation-a")
        installation = SimpleNamespace(id="installation-a")
        databases = []
        requests = []
        for text in ("First", "Second"):
            db = MagicMock()
            db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = job
            db.get.side_effect = [link, installation]
            databases.append(db)
            request = MagicMock()
            request.json = AsyncMock(return_value={"kind": "status", "text": text})
            requests.append(request)

        first_slack_started = asyncio.Event()
        release_first_slack = asyncio.Event()

        async def controlled_slack(*args, **kwargs):
            if not first_slack_started.is_set():
                first_slack_started.set()
                await release_first_slack.wait()
                return {"ok": True, "ts": "101.002"}
            return {"ok": True}

        with patch(
            "routes.hosted_claw.KmsEnvelope.decrypt",
            return_value=b'{"channel_id":"D123","thread_ts":"100.001"}',
        ), patch("routes.hosted_claw.slack_api", side_effect=controlled_slack):
            first = asyncio.create_task(
                post_job_progress("job-concurrent", "worker-a", requests[0], databases[0])
            )
            await first_slack_started.wait()
            second = asyncio.create_task(
                post_job_progress("job-concurrent", "worker-a", requests[1], databases[1])
            )
            await asyncio.sleep(0)

            databases[1].query.assert_not_called()

            release_first_slack.set()
            await asyncio.gather(first, second)

        databases[0].commit.assert_called_once_with()
        databases[1].commit.assert_called_once_with()


class HostedCronMarkdownDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def test_scheduled_result_posts_as_standard_markdown(self) -> None:
        connector = SimpleNamespace(user_id="user-a", runtime_id="runtime-a")
        occurrence = SimpleNamespace(
            id="occurrence-a",
            status="running",
            delivery_attempted_at=None,
            delivery_status="pending",
            error_code=None,
            delivered_at=None,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = occurrence
        link = SimpleNamespace(slack_user_id="U123")
        installation = SimpleNamespace(id="installation-a")
        body = SimpleNamespace(
            occurrence_id="occurrence-a",
            text="## Daily report\n\n**Total:** [details](https://example.com/report)",
        )

        with patch(
            "routes.hosted_claw._hosted_connector",
            return_value=connector,
        ), patch(
            "routes.hosted_claw.active_slack_context",
            return_value=(link, installation),
        ), patch(
            "routes.hosted_claw.slack_api",
            new=AsyncMock(
                side_effect=[
                    {"ok": True, "channel": {"id": "D123"}},
                    {"ok": True, "ts": "101.002"},
                ]
            ),
        ) as slack:
            result = await deliver_runtime_cron_text(body, MagicMock(), db)

        self.assertEqual(result, {"success": True, "message_id": "101.002"})
        self.assertEqual(slack.await_args_list[1].args[1:], (
            "chat.postMessage",
            {
                "channel": "D123",
                "markdown_text": "## Daily report\n\n**Total:** [details](https://example.com/report)",
                "client_msg_id": "occurrence-a",
            },
        ))
        self.assertEqual(occurrence.delivery_status, "delivered")


class HostedTurnTimeoutTests(unittest.IsolatedAsyncioTestCase):
    async def test_sse_keepalives_do_not_defeat_event_inactivity_timeout(self) -> None:
        async def lines():
            yield ": keepalive"
            await asyncio.Event().wait()
            yield "unreachable"

        events = HermesRuns._iter_events(lines(), inactivity_seconds=0.01)
        with self.assertRaises(HermesEventInactivityTimeout):
            await anext(events)

    async def test_event_inactivity_maps_to_hosted_turn_timeout(self) -> None:
        async def events():
            raise HermesEventInactivityTimeout("inactive")
            yield {}

        with self.assertRaises(HostedTurnTimeout) as raised:
            await Supervisor._next_hermes_event(
                events(), asyncio.get_running_loop().time() + 1
            )

        self.assertEqual(raised.exception.reason, "event stream inactive")

    async def test_hard_timeout_stops_run_and_finalizes_slack(self) -> None:
        runtime = Runtime(
            runtime_id="runtime-a",
            user_id="user-a",
            product="accountingclaw",
            container_name="tenant-a",
            proxy_name="proxy-a",
            network_name="network-a",
            data_dir=Path("/tmp/runtime-a"),
            api_key="key",
            api_url="http://runtime",
            config_revision=1,
            model_alias="claw-default",
            last_activity=0,
            cold_started=False,
        )

        async def stalled_run(*_args, **_kwargs):
            yield {"type": "run.started", "run_id": "run-a"}
            await asyncio.Event().wait()

        supervisor = Supervisor.__new__(Supervisor)
        supervisor.semaphore = asyncio.Semaphore(1)
        supervisor.worker_id = "worker-a"
        supervisor.prepare_runtime_capacity = AsyncMock()
        supervisor.release_runtime_capacity = AsyncMock()

        async def control_request(_method, path, **_kwargs):
            if path == "/api/internal/hosted-claw/runtime-credentials":
                return {"connector_token": "connector-key"}
            return {}

        supervisor.control = SimpleNamespace(
            request=AsyncMock(side_effect=control_request)
        )
        supervisor.litellm = SimpleNamespace(
            rotate_tenant_key=AsyncMock(return_value="llm-key")
        )
        supervisor.docker = SimpleNamespace(
            ensure=MagicMock(return_value=runtime),
            stop_runtime=MagicMock(),
        )
        supervisor.hermes = SimpleNamespace(
            run=stalled_run,
            stop=AsyncMock(return_value=None),
        )
        job = {
            "job_id": "job-a",
            "queued_at": datetime.now(timezone.utc).isoformat(),
            "runtime_id": "runtime-a",
            "user_id": "user-a",
            "product": "accountingclaw",
            "session_id": "hcs-session-a",
            "payload": {"text": "List Linear issues", "files": []},
            "config": {
                "model_alias": "claw-default",
                "revision": 1,
                "timezone": "America/Los_Angeles",
                "personal_instructions": "",
            },
            "monthly_budget_usd": "10",
            "remaining_budget_usd": "10",
            "budget_period": "2026-08-01",
        }

        with patch("hosted_claw.supervisor.TURN_TIMEOUT_SECONDS", 0.01):
            await supervisor.process(job)

        supervisor.hermes.stop.assert_awaited_once_with(runtime, "run-a")
        supervisor.docker.stop_runtime.assert_called_once_with("runtime-a")
        supervisor.release_runtime_capacity.assert_awaited_once_with("runtime-a")
        timeout_progress = unittest.mock.call(
            "POST",
            "/api/internal/hosted-claw/jobs/job-a/progress?worker_id=worker-a",
            json={
                "kind": "final",
                "text": "This hosted turn timed out before completion. Please try again.",
            },
        )
        self.assertIn(timeout_progress, supervisor.control.request.await_args_list)
        completion_calls = [
            call
            for call in supervisor.control.request.await_args_list
            if call.args[1].endswith("/complete?worker_id=worker-a")
        ]
        self.assertEqual(len(completion_calls), 1)
        self.assertEqual(
            completion_calls[0].kwargs["json"],
            {
                "status": "failed",
                "error_code": "turn_timeout",
                "run_id": "run-a",
            },
        )


class HostedHermesNativeSessionTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def runtime() -> Runtime:
        return Runtime(
            runtime_id="runtime-native",
            user_id="user-native",
            product="accountingclaw",
            container_name="tenant-native",
            proxy_name="proxy-native",
            network_name="network-native",
            data_dir=Path("/tmp/runtime-native"),
            api_key="api-key",
            api_url="http://hermes",
            config_revision=1,
            model_alias="claw-default",
            last_activity=0,
            cold_started=False,
        )

    async def test_creates_then_reuses_native_session_and_streams_rotation(self) -> None:
        requests: list[httpx.Request] = []
        session_exists = False
        chat_count = 0

        async def handler(request: httpx.Request) -> httpx.Response:
            nonlocal session_exists, chat_count
            requests.append(request)
            if request.url.path == "/v1/capabilities":
                endpoints = {
                    name: {"path": name}
                    for name in HermesRuns.REQUIRED_SESSION_ENDPOINTS
                }
                return httpx.Response(200, json={"endpoints": endpoints})
            if request.url.path == "/api/sessions/hcs-native" and request.method == "GET":
                return httpx.Response(
                    200 if session_exists else 404,
                    json={"session": {"id": "hcs-native"}} if session_exists else {},
                )
            if request.url.path == "/api/sessions" and request.method == "POST":
                session_exists = True
                return httpx.Response(201, json={"session": {"id": "hcs-native"}})
            if request.url.path == "/api/sessions/hcs-native/model":
                return httpx.Response(200, json={"session_id": "hcs-native"})
            if request.url.path == "/api/sessions/hcs-native/chat/stream":
                chat_count += 1
                effective_id = "hcs-rotated" if chat_count == 2 else "hcs-native"
                content = "second answer" if chat_count == 2 else "first answer"
                sse = (
                    'event: run.started\ndata: {"run_id":"run-native"}\n\n'
                    f'event: assistant.delta\ndata: {{"delta":"{content}"}}\n\n'
                    f'event: assistant.completed\ndata: {{"content":"{content}","session_id":"{effective_id}"}}\n\n'
                    f'event: run.completed\ndata: {{"session_id":"{effective_id}","usage":{{"input_tokens":7,"output_tokens":3}}}}\n\n'
                    'event: done\ndata: {}\n\n'
                )
                return httpx.Response(
                    200,
                    content=sse.encode(),
                    headers={"content-type": "text/event-stream"},
                )
            return httpx.Response(404)

        transport = httpx.MockTransport(handler)
        real_client = httpx.AsyncClient

        def client_factory(*_args, **kwargs):
            return real_client(transport=transport, timeout=kwargs.get("timeout"))

        hermes = HermesRuns()
        runtime = self.runtime()
        with patch("hosted_claw.supervisor.httpx.AsyncClient", side_effect=client_factory):
            first = [
                event
                async for event in hermes.run(
                    runtime, "first prompt", "hcs-native", "managed instructions"
                )
            ]
            second = [
                event
                async for event in hermes.run(
                    runtime, "follow-up", "hcs-native", "managed instructions"
                )
            ]

        creates = [
            request
            for request in requests
            if request.method == "POST" and request.url.path == "/api/sessions"
        ]
        self.assertEqual(len(creates), 1)
        self.assertEqual(
            json.loads(creates[0].content),
            {"id": "hcs-native", "source": "slack", "model": "claw-default"},
        )
        chat_requests = [request for request in requests if request.url.path.endswith("/chat/stream")]
        self.assertEqual(len(chat_requests), 2)
        self.assertEqual(json.loads(chat_requests[1].content)["input"], "follow-up")
        self.assertTrue(
            chat_requests[0].headers["X-Hermes-Session-Key"].startswith(
                "agent:main:slack:dm:"
            )
        )
        self.assertEqual(first[-2]["session_id"], "hcs-native")
        self.assertEqual(second[-2]["session_id"], "hcs-rotated")

    async def test_missing_native_capability_fails_without_starting_a_run(self) -> None:
        requests: list[httpx.Request] = []

        async def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            return httpx.Response(200, json={"endpoints": {}})

        transport = httpx.MockTransport(handler)
        real_client = httpx.AsyncClient

        def client_factory(*_args, **kwargs):
            return real_client(transport=transport, timeout=kwargs.get("timeout"))

        with patch("hosted_claw.supervisor.httpx.AsyncClient", side_effect=client_factory):
            with self.assertRaisesRegex(RuntimeError, "native session API is unavailable"):
                _ = [
                    event
                    async for event in HermesRuns().run(
                        self.runtime(), "prompt", "hcs-native", "instructions"
                    )
                ]

        self.assertEqual([request.url.path for request in requests], ["/v1/capabilities"])

    async def test_supervisor_persists_native_session_rotation_and_usage(self) -> None:
        runtime = self.runtime()

        async def native_events(*_args, **_kwargs):
            yield {"type": "session.ready", "session_id": "hcs-native"}
            yield {"type": "run.started", "run_id": "run-native"}
            yield {
                "type": "tool.started",
                "tool_name": "connector_search",
                "preview": "Search connected records",
            }
            yield {"type": "tool.completed", "tool_name": "connector_search"}
            yield {"type": "assistant.delta", "delta": "partial"}
            yield {
                "type": "assistant.completed",
                "content": "final answer",
                "session_id": "hcs-rotated",
            }
            yield {
                "type": "artifact.created",
                "path": "/opt/data/workspace/report.csv",
                "content_type": "text/csv",
            }
            yield {
                "type": "run.completed",
                "session_id": "hcs-rotated",
                "usage": {"input_tokens": 11, "output_tokens": 5},
            }
            yield {"type": "done"}

        async def control_request(_method, path, **_kwargs):
            if path == "/api/internal/hosted-claw/runtime-credentials":
                return {"connector_token": "connector-key"}
            if path.endswith("/state?worker_id=worker-a"):
                return {"status": "running"}
            return {}

        supervisor = Supervisor.__new__(Supervisor)
        supervisor.semaphore = asyncio.Semaphore(1)
        supervisor.worker_id = "worker-a"
        supervisor.prepare_runtime_capacity = AsyncMock()
        supervisor.release_runtime_capacity = AsyncMock()
        supervisor.control = SimpleNamespace(
            request=AsyncMock(side_effect=control_request)
        )
        supervisor.litellm = SimpleNamespace(
            rotate_tenant_key=AsyncMock(return_value="llm-key")
        )
        supervisor.docker = SimpleNamespace(
            ensure=MagicMock(return_value=runtime),
            stop_runtime=MagicMock(),
        )
        supervisor.hermes = SimpleNamespace(
            run=native_events,
            stop=AsyncMock(),
        )
        supervisor._deliver_generated_artifact = AsyncMock()
        job = {
            "job_id": "job-native",
            "queued_at": datetime.now(timezone.utc).isoformat(),
            "runtime_id": runtime.runtime_id,
            "user_id": runtime.user_id,
            "product": runtime.product,
            "session_id": "hcs-native",
            "payload": {"text": "follow-up", "files": []},
            "config": {
                "model_alias": runtime.model_alias,
                "revision": 1,
                "timezone": "America/Los_Angeles",
                "personal_instructions": "",
            },
            "monthly_budget_usd": "10",
            "remaining_budget_usd": "10",
            "budget_period": "2026-08-01",
        }

        with patch("hosted_claw.supervisor.ACTION_PROGRESS_MIN_INTERVAL_SECONDS", 0):
            await supervisor.process(job)

        action_progress = unittest.mock.call(
            "POST",
            "/api/internal/hosted-claw/jobs/job-native/progress?worker_id=worker-a",
            json={
                "kind": "status",
                "text": "Working on it…\n\n*Actions*\n"
                "• ✅ Connector search — Search connected records",
            },
        )
        self.assertIn(action_progress, supervisor.control.request.await_args_list)
        final_progress = unittest.mock.call(
            "POST",
            "/api/internal/hosted-claw/jobs/job-native/progress?worker_id=worker-a",
            json={"kind": "final", "text": "final answer"},
        )
        self.assertIn(final_progress, supervisor.control.request.await_args_list)
        completion = [
            call
            for call in supervisor.control.request.await_args_list
            if call.args[1].endswith("/complete?worker_id=worker-a")
        ]
        self.assertEqual(
            completion[0].kwargs["json"],
            {
                "status": "completed",
                "hermes_session_id": "hcs-rotated",
                "applied_config_revision": 1,
                "prompt_tokens": 11,
                "completion_tokens": 5,
                "cost_usd": 0.0,
            },
        )
        supervisor.hermes.stop.assert_not_awaited()
        supervisor.docker.stop_runtime.assert_not_called()
        supervisor._deliver_generated_artifact.assert_awaited_once_with(
            job,
            runtime,
            (runtime.data_dir / "workspace").resolve() / "report.csv",
            "text/csv",
        )


class HostedRuntimeStateTests(unittest.TestCase):
    def test_hermes_session_id_is_stable_until_explicitly_cleared(self) -> None:
        existing = SimpleNamespace(hermes_session_id="run-existing")
        self.assertEqual(_ensure_hermes_session_id(existing), "run-existing")

        fresh = SimpleNamespace(hermes_session_id=None)
        generated = _ensure_hermes_session_id(fresh)
        self.assertTrue(generated.startswith("hcs_"))
        self.assertEqual(fresh.hermes_session_id, generated)

    def test_warm_same_worker_same_revision_does_not_restart(self) -> None:
        session = SimpleNamespace(
            runtime_id="runtime-a",
            status="ready",
            worker_id="worker-a",
            applied_config_revision=3,
        )
        self.assertFalse(_runtime_start_expected(session, "worker-a", 3))

    def test_stopped_moved_or_reconfigured_runtime_starts(self) -> None:
        cases = [
            SimpleNamespace(runtime_id="runtime-a", status="stopped", worker_id="worker-a", applied_config_revision=3),
            SimpleNamespace(runtime_id="runtime-a", status="ready", worker_id="worker-b", applied_config_revision=3),
            SimpleNamespace(runtime_id="runtime-a", status="ready", worker_id="worker-a", applied_config_revision=2),
        ]
        for session in cases:
            with self.subTest(session=session):
                self.assertTrue(_runtime_start_expected(session, "worker-a", 3))


class HostedOneTimeTokenTests(unittest.TestCase):
    def test_expiry_and_replay_are_rejected(self) -> None:
        now = datetime.now(timezone.utc)
        valid = SimpleNamespace(consumed_at=None, expires_at=now + timedelta(minutes=1))
        consumed = SimpleNamespace(consumed_at=now, expires_at=now + timedelta(minutes=1))
        expired = SimpleNamespace(consumed_at=None, expires_at=now - timedelta(seconds=1))
        self.assertTrue(one_time_record_is_valid(valid, now=now))
        self.assertFalse(one_time_record_is_valid(consumed, now=now))
        self.assertFalse(one_time_record_is_valid(expired, now=now))
        self.assertFalse(one_time_record_is_valid(None, now=now))


class HostedOAuthInstallerLinkTests(unittest.TestCase):
    def test_oauth_install_links_the_authenticated_installer(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = None
        installation = SimpleNamespace(id="installation-id")

        with patch("routes.hosted_claw._active_link_query") as active_link_query:
            active_link_query.return_value.with_for_update.return_value.first.return_value = None
            link = _link_oauth_installer(
                db,
                installation=installation,
                user_id="firebase-user",
                enterprise_id=None,
                team_id="T123",
                slack_user_id="U123",
            )

        self.assertEqual(link.user_id, "firebase-user")
        self.assertEqual(link.installation_id, "installation-id")
        self.assertEqual(link.team_id, "T123")
        self.assertEqual(link.slack_user_id, "U123")
        db.add.assert_called_once_with(link)

    def test_oauth_reinstall_is_idempotent_for_the_same_link(self) -> None:
        db = MagicMock()
        existing = SimpleNamespace(
            installation_id="old-installation",
            enterprise_id=None,
            team_id="T123",
            slack_user_id="U123",
            user_id="firebase-user",
        )
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = existing
        with patch("routes.hosted_claw._active_link_query") as active_link_query:
            active_link_query.return_value.with_for_update.return_value.first.return_value = existing
            link = _link_oauth_installer(
                db,
                installation=SimpleNamespace(id="current-installation"),
                user_id="firebase-user",
                enterprise_id=None,
                team_id="T123",
                slack_user_id="U123",
            )

        self.assertIs(link, existing)
        self.assertEqual(link.installation_id, "current-installation")
        db.add.assert_not_called()

    def test_oauth_install_does_not_replace_a_conflicting_user_link(self) -> None:
        db = MagicMock()
        existing_user = SimpleNamespace(
            enterprise_id=None,
            team_id="T-other",
            slack_user_id="U-other",
            user_id="firebase-user",
        )
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = existing_user
        with patch("routes.hosted_claw._active_link_query") as active_link_query:
            active_link_query.return_value.with_for_update.return_value.first.return_value = None
            with self.assertRaises(HTTPException) as raised:
                _link_oauth_installer(
                    db,
                    installation=SimpleNamespace(id="installation-id"),
                    user_id="firebase-user",
                    enterprise_id=None,
                    team_id="T123",
                    slack_user_id="U123",
                )

        self.assertEqual(raised.exception.status_code, 409)
        db.add.assert_not_called()


class HostedKmsTests(unittest.TestCase):
    def test_missing_kms_configuration_fails_closed(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HostedClawUnavailable):
                KmsEnvelope().encrypt(b"secret", aad=b"tenant")

    def test_encrypt_and_decrypt_bind_aad(self) -> None:
        client = MagicMock()
        version = "projects/p/locations/l/keyRings/r/cryptoKeys/k/cryptoKeyVersions/1"
        client.encrypt.return_value = SimpleNamespace(ciphertext=b"encrypted", name=version)
        client.decrypt.return_value = SimpleNamespace(plaintext=b"secret")
        kms = KmsEnvelope("projects/p/locations/l/keyRings/r/cryptoKeys/k", client=client)
        encrypted = kms.encrypt(b"secret", aad=b"job:a")
        self.assertEqual(encrypted.ciphertext, b"encrypted")
        self.assertEqual(encrypted.key_version, version)
        self.assertEqual(kms.decrypt(encrypted.ciphertext, aad=b"job:a", key_version=encrypted.key_version), b"secret")
        self.assertEqual(client.encrypt.call_args.kwargs["request"]["additional_authenticated_data"], b"job:a")
        self.assertEqual(client.decrypt.call_args.kwargs["request"]["additional_authenticated_data"], b"job:a")
        self.assertEqual(
            client.decrypt.call_args.kwargs["request"]["name"],
            "projects/p/locations/l/keyRings/r/cryptoKeys/k",
        )


class HostedPubSubTests(unittest.TestCase):
    def test_publish_uses_deployed_project_id_environment(self) -> None:
        from google.cloud import pubsub_v1

        publisher = MagicMock()
        publisher.topic_path.return_value = "projects/p/topics/hosted-claw-jobs"
        with patch.dict(
            os.environ,
            {
                "ENVIRONMENT": "production",
                "GOOGLE_CLOUD_PROJECT_ID": "p",
                "HOSTED_CLAW_PUBSUB_TOPIC": "hosted-claw-jobs",
            },
            clear=True,
        ), patch.object(pubsub_v1, "PublisherClient", return_value=publisher):
            publish_job("job-id")

        publisher.topic_path.assert_called_once_with("p", "hosted-claw-jobs")
        publisher.publish.assert_called_once_with(
            "projects/p/topics/hosted-claw-jobs",
            b'{"job_id": "job-id"}',
        )


class HostedApprovalTests(unittest.TestCase):
    def test_canonical_hash_is_order_independent_and_value_sensitive(self) -> None:
        left = {"amount": 10, "target": {"b": 2, "a": 1}}
        right = {"target": {"a": 1, "b": 2}, "amount": 10}
        changed = {"target": {"a": 1, "b": 2}, "amount": 11}
        self.assertEqual(canonical_arguments(left), canonical_arguments(right))
        self.assertEqual(approval_argument_hash(left), approval_argument_hash(right))
        self.assertNotEqual(approval_argument_hash(left), approval_argument_hash(changed))

    def test_unknown_connector_action_defaults_to_write_risk(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        self.assertFalse(action_is_read_only(db, "new_provider.unknown_action"))
        db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(enabled=True)
        self.assertTrue(action_is_read_only(db, "github.get_current_user"))

    def test_plugin_allows_read_write_terminal_and_unknown_tools(self) -> None:
        calls = (
            ("list_files", {}),
            ("execute_action", {"actionId": "slack.send_message"}),
            ("terminal", {"command": "rm generated.txt"}),
            ("new_unclassified_tool", {}),
        )
        for tool_name, args in calls:
            with self.subTest(tool_name=tool_name):
                self.assertIsNone(_PLUGIN.pre_tool_call(tool_name, args, "run-a"))


class HostedConnectorPermissionTests(unittest.IsolatedAsyncioTestCase):
    async def test_write_action_executes_without_approval_metadata(self) -> None:
        action_result = {"content": [{"type": "text", "text": "done"}]}
        message = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "execute_action",
                "arguments": {"actionId": "slack.send_message", "input": {"text": "hello"}},
            },
        }
        with patch("routes.connector.rate_limiter.check", return_value=True), patch(
            "routes.connector._mcp_execute_action", new=AsyncMock(return_value=action_result)
        ) as execute:
            response = await _handle_mcp_message(MagicMock(), "user-id", message)

        self.assertEqual(response, {"jsonrpc": "2.0", "id": 1, "result": action_result})
        execute.assert_awaited_once()


class HostedManagedConfigTests(unittest.TestCase):
    def test_renderer_uses_managed_fields_only(self) -> None:
        config = SimpleNamespace(
            active_product="accountingclaw",
            model_alias="claw-default",
            personal_instructions="Prefer concise workpapers.",
            timezone="America/Los_Angeles",
            memory_enabled=False,
        )
        rendered = managed_hermes_config(config, "https://api.example/mcp", "http://litellm:4000/v1")
        self.assertEqual(rendered["model"]["default"], "claw-default")
        self.assertEqual(rendered["model"]["provider"], "custom")
        self.assertEqual(list(rendered["mcp_servers"]), ["cpaautomation"])
        self.assertFalse(rendered["memory"]["memory_enabled"])
        self.assertIn("memory", rendered["agent"]["disabled_toolsets"])
        self.assertEqual(rendered["plugins"]["enabled"], ["hosted-policy", "cpaa-hosted"])
        self.assertEqual(rendered["cron"]["provider"], "cpaa-hosted")
        self.assertFalse(rendered["security"]["allow_custom_mcp"])
        self.assertFalse(rendered["security"]["allow_provider_keys"])
        self.assertFalse(
            rendered["security"]["terminal"]["approval_required_for_dangerous_operations"]
        )

    def test_cron_feature_uses_managed_provider_and_delivery_platform(self) -> None:
        config = SimpleNamespace(
            active_product="legalclaw",
            model_alias="claw-default",
            personal_instructions="",
            timezone="America/New_York",
            memory_enabled=True,
        )
        with patch.dict(os.environ, {"HOSTED_CLAW_CRON_ENABLED": "true"}):
            rendered = managed_hermes_config(config, "https://api.example/mcp", "http://litellm/v1")

        self.assertNotIn("cron", rendered["agent"]["disabled_toolsets"])
        self.assertEqual(rendered["cron"]["provider"], "cpaa-hosted")
        self.assertEqual(rendered["cron"]["completed_retention_days"], 30)
        self.assertTrue(rendered["platforms"]["cpaa-hosted"]["enabled"])
        self.assertEqual(rendered["plugins"]["enabled"], ["hosted-policy", "cpaa-hosted"])

    def test_supervisor_renderer_matches_managed_cron_configuration(self) -> None:
        manager = DockerRuntimeManager()
        config = {
            "active_product": "accountingclaw",
            "model_alias": "claw-default",
            "timezone": "UTC",
            "memory_enabled": True,
        }
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ, {"HOSTED_CLAW_CRON_ENABLED": "true"}
        ), patch("hosted_claw.supervisor.os.chown"):
            data_dir = Path(directory) / "tenant"
            manager._write_config(data_dir, config, "http://connector", "http://model")
            rendered = __import__("yaml").safe_load((data_dir / "config.yaml").read_text())

        self.assertNotIn("cron", rendered["agent"]["disabled_toolsets"])
        self.assertEqual(rendered["cron"]["provider"], "cpaa-hosted")
        self.assertEqual(rendered["plugins"]["enabled"], ["hosted-policy", "cpaa-hosted"])


def _load_hosted_cron_plugin():
    scheduler_module = types.ModuleType("cron.scheduler_provider")

    class FakeScheduler:
        def fire_due(self, *args, **kwargs):
            return True

        def recover_interrupted(self):
            return 0

    scheduler_module.CronScheduler = FakeScheduler
    cron_package = types.ModuleType("cron")
    cron_package.__path__ = []
    spec = spec_from_file_location(
        "_cpaa_hosted_cron_plugin",
        Path(__file__).resolve().parents[2] / "hosted_claw" / "cpaa_hosted_plugin" / "__init__.py",
    )
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    with patch.dict(sys.modules, {"cron": cron_package, "cron.scheduler_provider": scheduler_module}):
        spec.loader.exec_module(module)
    return module


class HostedCronPolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.plugin = _load_hosted_cron_plugin()

    def test_safe_agent_job_shape_is_allowed(self) -> None:
        self.assertIsNone(
            self.plugin.pre_tool_call(
                "cronjob",
                {
                    "action": "create",
                    "schedule": "0 9 * * *",
                    "prompt": "Prepare the daily close summary.",
                    "deliver": "cpaa-hosted",
                    "workdir": "/opt/data/workspace",
                },
            )
        )

    def test_plugin_registers_provider_and_outbound_only_platform(self) -> None:
        context = MagicMock()
        self.plugin.register(context)

        context.register_cron_scheduler.assert_called_once()
        platform = context.register_platform.call_args.kwargs
        self.assertEqual(platform["name"], "cpaa-hosted")
        self.assertEqual(platform["cron_deliver_env_var"], "CPAA_HOSTED_HOME_CHANNEL")
        self.assertIs(platform["standalone_sender_fn"], self.plugin._standalone_send)
        self.assertIsNone(platform["adapter_factory"](None))

    def test_unsafe_cron_shapes_are_blocked(self) -> None:
        base = {
            "action": "create",
            "schedule": "0 9 * * *",
            "prompt": "Prepare a summary.",
            "deliver": "cpaa-hosted",
            "workdir": "/opt/data/workspace",
        }
        cases = [
            {"script": "watch.py"},
            {"no_agent": True},
            {"workdir": "/tmp"},
            {"deliver": "slack:U123"},
            {"model": "other"},
            {"provider": "other"},
            {"base_url": "https://example.invalid"},
            {"profile": "other"},
            {"profile_id": "other"},
            {"enabled_toolsets": ["terminal"]},
        ]
        for changes in cases:
            with self.subTest(changes=changes):
                result = self.plugin.pre_tool_call("cronjob", {**base, **changes})
                self.assertEqual(result["action"], "block")

    def test_manual_run_queues_a_wake_instead_of_running_inline(self) -> None:
        jobs_module = types.ModuleType("cron.jobs")
        jobs_module.resolve_job_ref = lambda value: {"id": "native-1", "enabled": True, "state": "scheduled"}
        with patch.dict(sys.modules, {"cron.jobs": jobs_module}), patch.object(
            self.plugin,
            "_sync",
            return_value={"queued_occurrence_ids": ["occurrence-1"]},
        ) as sync:
            result = self.plugin.pre_tool_call("cronjob", {"action": "run", "job_id": "daily"})

        self.assertEqual(result["action"], "block")
        self.assertIn("queued", result["message"])
        self.assertEqual(sync.call_args.kwargs["manual_job_id"], "native-1")

    def test_provider_reports_native_ledger_failure(self) -> None:
        executions_module = types.ModuleType("cron.executions")
        executions_module.latest_execution = lambda job_id: {
            "job_id": job_id,
            "status": "failed",
        }
        calls = []

        def request(path, payload=None):
            calls.append((path, payload))
            return {"success": True}

        provider = self.plugin.CpaaHostedCronScheduler()
        with patch.dict(sys.modules, {"cron.executions": executions_module}), patch.object(
            self.plugin, "_request", side_effect=request
        ), patch.object(provider, "reconcile"), patch.object(self.plugin, "_prune_local_history"):
            provider._fire_occurrence(
                {"occurrence_id": "occurrence-1", "native_job_id": "native-1"},
            )

        completion = [payload for path, payload in calls if path.endswith("/complete")]
        self.assertEqual(completion, [{"status": "failed", "error_code": "native_execution_failed"}])


class HostedCronLedgerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite://")
        HostedClawCronSchedule.__table__.create(self.engine)
        HostedClawCronOccurrence.__table__.create(self.engine)
        self.db = Session(self.engine)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_reconciliation_stores_only_metadata_and_is_full_snapshot(self) -> None:
        queued, synced = reconcile_schedules(
            self.db,
            user_id="user-a",
            product="accountingclaw",
            snapshots=[
                SimpleNamespace(
                    native_job_id="native-a",
                    state="scheduled",
                    next_fire_at=datetime(2026, 8, 5, 16, tzinfo=timezone.utc),
                )
            ],
        )
        self.db.commit()
        row = self.db.query(HostedClawCronSchedule).one()

        self.assertEqual((queued, synced), ([], 1))
        self.assertEqual(row.native_job_id, "native-a")
        self.assertFalse(hasattr(row, "prompt"))
        self.assertFalse(hasattr(row, "arguments"))
        reconcile_schedules(
            self.db,
            user_id="user-a",
            product="accountingclaw",
            snapshots=[],
        )
        self.db.commit()
        self.assertEqual(row.state, "removed")
        self.assertIsNone(row.next_fire_at)

    def test_manual_reconciliation_is_idempotent_by_request(self) -> None:
        snapshot = SimpleNamespace(
            native_job_id="native-a",
            state="scheduled",
            next_fire_at=datetime(2026, 8, 5, 16, tzinfo=timezone.utc),
        )
        first, _ = reconcile_schedules(
            self.db,
            user_id="user-a",
            product="accountingclaw",
            snapshots=[snapshot],
            manual_job_id="native-a",
            manual_request_id="manual-request-0001",
        )
        self.db.commit()
        second, _ = reconcile_schedules(
            self.db,
            user_id="user-a",
            product="accountingclaw",
            snapshots=[snapshot],
            manual_job_id="native-a",
            manual_request_id="manual-request-0001",
        )
        self.db.commit()

        self.assertEqual(len(first), 1)
        self.assertEqual(second, [])
        self.assertEqual(self.db.query(HostedClawCronOccurrence).count(), 1)

    def test_schedule_and_fire_time_identify_one_occurrence(self) -> None:
        schedule = HostedClawCronSchedule(
            user_id="user-a",
            product="accountingclaw",
            native_job_id="native-a",
            state="scheduled",
            next_fire_at=datetime.now(timezone.utc),
        )
        self.db.add(schedule)
        self.db.flush()
        fire_at = datetime.now(timezone.utc)
        for _ in range(2):
            self.db.add(
                HostedClawCronOccurrence(
                    schedule_id=schedule.id,
                    user_id="user-a",
                    product="accountingclaw",
                    native_job_id="native-a",
                    fire_at=fire_at,
                )
            )
        with self.assertRaises(IntegrityError):
            self.db.commit()
        self.db.rollback()

    def test_expiry_reclaims_before_native_claim_and_quarantines_after(self) -> None:
        schedule = HostedClawCronSchedule(
            user_id="user-a",
            product="accountingclaw",
            native_job_id="native-a",
            state="scheduled",
            next_fire_at=datetime.now(timezone.utc),
        )
        self.db.add(schedule)
        self.db.flush()
        expired = datetime.now(timezone.utc) - timedelta(minutes=1)
        before = HostedClawCronOccurrence(
            schedule_id=schedule.id,
            user_id="user-a",
            product="accountingclaw",
            native_job_id="native-a",
            fire_at=datetime.now(timezone.utc) - timedelta(minutes=3),
            status="ready",
            worker_id="dead-worker",
            runtime_id="runtime-a",
            lease_expires_at=expired,
        )
        after = HostedClawCronOccurrence(
            schedule_id=schedule.id,
            user_id="user-b",
            product="accountingclaw",
            native_job_id="native-b",
            fire_at=datetime.now(timezone.utc) - timedelta(minutes=2),
            status="running",
            worker_id="dead-worker",
            runtime_id="runtime-b",
            provider_claimed_at=expired,
            lease_expires_at=expired,
        )
        self.db.add_all([before, after])
        self.db.commit()

        reclaimed, unknown = recover_expired_occurrences(self.db)
        self.db.commit()

        self.assertEqual((reclaimed, unknown), (1, 1))
        self.assertEqual(before.status, "pending")
        self.assertIsNone(before.worker_id)
        self.assertEqual(after.status, "unknown")
        self.assertEqual(after.error_code, "ambiguous_runtime_exit")


class HostedArtifactValidationTests(unittest.TestCase):
    def test_slack_download_url_blocks_ssrf_hosts(self) -> None:
        self.assertTrue(_valid_slack_file_url("https://files.slack.com/files-pri/T-F/report.pdf"))
        self.assertFalse(_valid_slack_file_url("http://files.slack.com/report.pdf"))
        self.assertFalse(_valid_slack_file_url("https://slack.com.evil.example/report.pdf"))
        self.assertFalse(_valid_slack_file_url("https://metadata.google.internal/computeMetadata/v1/"))

    def test_supported_file_and_limits(self) -> None:
        validate_attachment("report.pdf", "application/pdf", 50 * 1024 * 1024)
        validate_attachment("invoices.zip", "application/zip", 1024)
        validate_attachment("invoices.zip", "application/x-zip-compressed", 1024)

    def test_macro_archive_executable_traversal_and_oversize_rejected(self) -> None:
        cases = [
            ("macro.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12", 10),
            ("files.zip", "application/pdf", 10),
            ("run.exe", "application/x-msdownload", 10),
            ("../report.pdf", "application/pdf", 10),
            ("report.pdf", "application/pdf", 50 * 1024 * 1024 + 1),
        ]
        for filename, content_type, size in cases:
            with self.subTest(filename=filename):
                with self.assertRaises(HTTPException):
                    validate_attachment(filename, content_type, size)

    def test_zip_validation_accepts_documents_and_rejects_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            safe = Path(directory) / "safe.zip"
            with zipfile.ZipFile(safe, "w") as archive:
                archive.writestr("invoices/one.pdf", b"%PDF-1.4\n")
            _ARTIFACTS.validate_zip_archive(safe)

            unsafe = Path(directory) / "unsafe.zip"
            with zipfile.ZipFile(unsafe, "w") as archive:
                archive.writestr("../escape.pdf", b"%PDF-1.4\n")
            with self.assertRaises(_ARTIFACTS.UnsafeArtifact):
                _ARTIFACTS.validate_zip_archive(unsafe)


if __name__ == "__main__":
    unittest.main()
