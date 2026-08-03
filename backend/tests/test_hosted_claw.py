from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

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
from routes.connector import _handle_mcp_message
from routes.hosted_claw import (
    _link_oauth_installer,
    _runtime_start_expected,
    _valid_slack_file_url,
    mark_job_started,
    post_job_progress,
    runtime_stopped,
)

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT))
try:
    from hosted_claw.supervisor import (
        EVENT_INACTIVITY_SECONDS,
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
    async def test_delayed_status_uses_neutral_copy(self) -> None:
        supervisor = Supervisor.__new__(Supervisor)
        supervisor.worker_id = "worker-a"
        supervisor.control = SimpleNamespace(request=AsyncMock(return_value={"ok": True}))
        request_started = asyncio.Event()

        with patch("hosted_claw.supervisor.PROGRESS_MESSAGE_DELAY_SECONDS", 0):
            await supervisor._post_delayed_turn_status("job-a", request_started)

        self.assertTrue(request_started.is_set())
        supervisor.control.request.assert_awaited_once_with(
            "POST",
            "/api/internal/hosted-claw/jobs/job-a/progress?worker_id=worker-a",
            json={"kind": "status", "text": "Working on it…"},
        )

    async def test_fast_turn_cancels_status_before_it_is_posted(self) -> None:
        supervisor = Supervisor.__new__(Supervisor)
        supervisor.worker_id = "worker-a"
        supervisor.control = SimpleNamespace(request=AsyncMock(return_value={"ok": True}))
        request_started = asyncio.Event()

        with patch("hosted_claw.supervisor.PROGRESS_MESSAGE_DELAY_SECONDS", 60):
            task = asyncio.create_task(
                supervisor._post_delayed_turn_status("job-a", request_started)
            )
            await asyncio.sleep(0)
            await supervisor._settle_turn_status(task, request_started)

        self.assertFalse(request_started.is_set())
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
        job_query.filter.return_value.with_for_update.return_value.first.return_value = job
        session_query = MagicMock()
        db = MagicMock()
        db.query.side_effect = [job_query, session_query]

        await mark_job_started("job-a", "worker-a", db)

        self.assertEqual(job.status, "running")
        update = session_query.filter.return_value.update
        update.assert_called_once()
        self.assertEqual(list(update.call_args.args[0].values()), ["running"])
        self.assertEqual(update.call_args.kwargs, {"synchronize_session": False})
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
            return_value={"kind": "final", "text": "The answer."}
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
            {"channel": "D123", "ts": "101.002", "text": "The answer."},
        ))


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
            yield {"type": "run.created", "run_id": "run-a"}
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
        supervisor.docker = SimpleNamespace(ensure=MagicMock(return_value=runtime))
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
            "session_id": None,
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

        with patch("hosted_claw.supervisor.TURN_TIMEOUT_SECONDS", 0.01), patch(
            "hosted_claw.supervisor.PROGRESS_MESSAGE_DELAY_SECONDS", 60
        ):
            await supervisor.process(job)

        supervisor.hermes.stop.assert_awaited_once_with(runtime, "run-a")
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


class HostedRuntimeStateTests(unittest.TestCase):
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
        self.assertEqual(rendered["plugins"]["enabled"], ["hosted-policy"])
        self.assertFalse(rendered["security"]["allow_custom_mcp"])
        self.assertFalse(rendered["security"]["allow_provider_keys"])
        self.assertFalse(
            rendered["security"]["terminal"]["approval_required_for_dangerous_operations"]
        )


class HostedArtifactValidationTests(unittest.TestCase):
    def test_slack_download_url_blocks_ssrf_hosts(self) -> None:
        self.assertTrue(_valid_slack_file_url("https://files.slack.com/files-pri/T-F/report.pdf"))
        self.assertFalse(_valid_slack_file_url("http://files.slack.com/report.pdf"))
        self.assertFalse(_valid_slack_file_url("https://slack.com.evil.example/report.pdf"))
        self.assertFalse(_valid_slack_file_url("https://metadata.google.internal/computeMetadata/v1/"))

    def test_supported_file_and_limits(self) -> None:
        validate_attachment("report.pdf", "application/pdf", 50 * 1024 * 1024)

    def test_macro_archive_executable_traversal_and_oversize_rejected(self) -> None:
        cases = [
            ("macro.xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12", 10),
            ("files.zip", "application/zip", 10),
            ("run.exe", "application/x-msdownload", 10),
            ("../report.pdf", "application/pdf", 10),
            ("report.pdf", "application/pdf", 50 * 1024 * 1024 + 1),
        ]
        for filename, content_type, size in cases:
            with self.subTest(filename=filename):
                with self.assertRaises(HTTPException):
                    validate_attachment(filename, content_type, size)


if __name__ == "__main__":
    unittest.main()
