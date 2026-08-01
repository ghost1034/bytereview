from __future__ import annotations

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
from unittest.mock import MagicMock, patch

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
from routes.connector import _consume_hosted_approval
from routes.hosted_claw import _link_oauth_installer, _valid_slack_file_url, runtime_stopped

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT))
try:
    from hosted_claw.supervisor import DockerRuntimeManager
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

    def test_hosted_grant_is_exact_and_committed_once(self) -> None:
        token = SimpleNamespace(id="token-id", token_kind="hosted_runtime")
        self.assertFalse(_consume_hosted_approval(MagicMock(), token, None, None, "x.write", {}))

        db = MagicMock()
        approval = SimpleNamespace(consumed_at=None, status="approved")
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = approval
        self.assertTrue(
            _consume_hosted_approval(db, token, "run-a", "hcgrant_secret", "x.write", {"amount": 10})
        )
        self.assertIsNotNone(approval.consumed_at)
        self.assertEqual(approval.status, "consumed")
        db.commit.assert_called_once_with()

    def test_self_hosted_tokens_remain_approval_compatible(self) -> None:
        token = SimpleNamespace(id="token-id", token_kind="self_hosted")
        db = MagicMock()
        self.assertTrue(_consume_hosted_approval(db, token, None, None, "x.write", {"amount": 10}))
        db.query.assert_not_called()

    def test_plugin_defaults_unknown_tools_to_approval(self) -> None:
        with patch.object(_PLUGIN, "_approval", return_value={"action": "block"}) as approval:
            self.assertEqual(_PLUGIN.pre_tool_call("new_unclassified_tool", {}, "run-a"), {"action": "block"})
            approval.assert_called_once_with("new_unclassified_tool", {}, "run-a")

    def test_plugin_keeps_explicit_read_tools_non_interactive(self) -> None:
        with patch.object(_PLUGIN, "_approval") as approval:
            self.assertIsNone(_PLUGIN.pre_tool_call("list_files", {}, "run-a"))
            self.assertIsNone(_PLUGIN.pre_tool_call("skill_view", {"name": "lease-842-assistant"}, "run-a"))
            approval.assert_not_called()


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
