from __future__ import annotations

import hashlib
import hmac
import json
import os
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
    validate_attachment,
)
from routes.connector import _consume_hosted_approval
from routes.hosted_claw import _valid_slack_file_url

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


class HostedKmsTests(unittest.TestCase):
    def test_missing_kms_configuration_fails_closed(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HostedClawUnavailable):
                KmsEnvelope().encrypt(b"secret", aad=b"tenant")

    def test_encrypt_and_decrypt_bind_aad(self) -> None:
        client = MagicMock()
        client.encrypt.return_value = SimpleNamespace(ciphertext=b"encrypted", name="key-version")
        client.decrypt.return_value = SimpleNamespace(plaintext=b"secret")
        kms = KmsEnvelope("projects/p/locations/l/keyRings/r/cryptoKeys/k", client=client)
        encrypted = kms.encrypt(b"secret", aad=b"job:a")
        self.assertEqual(encrypted.ciphertext, b"encrypted")
        self.assertEqual(kms.decrypt(encrypted.ciphertext, aad=b"job:a", key_version=encrypted.key_version), b"secret")
        self.assertEqual(client.encrypt.call_args.kwargs["request"]["additional_authenticated_data"], b"job:a")
        self.assertEqual(client.decrypt.call_args.kwargs["request"]["additional_authenticated_data"], b"job:a")


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
