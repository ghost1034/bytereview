from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, sentinel

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.runtime import environment, is_explicitly_local, local_auth_enabled, storage_backend, task_backend
from dependencies.auth import verify_firebase_token
from services.cloud_run_task_service import CloudRunTaskService
from services.local_storage_service import (
    LocalStorageClient,
    LocalStorageService,
    create_local_storage_token,
    verify_local_storage_token,
)
from services.gemini_file_service import part_from_storage_object


class LocalRuntimeTests(unittest.TestCase):
    def test_missing_environment_does_not_enable_local_security_bypasses(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(environment(), "local")
            self.assertEqual(storage_backend(), "local")
            self.assertEqual(task_backend(), "local")
            self.assertFalse(is_explicitly_local())
            self.assertFalse(local_auth_enabled())

    def test_non_production_defaults_do_not_select_cloud_backends(self) -> None:
        with patch.dict(os.environ, {"ENVIRONMENT": "local"}, clear=True):
            self.assertEqual(storage_backend(), "local")
            self.assertEqual(task_backend(), "local")

            service = CloudRunTaskService()
            self.assertEqual(service.backend, "local")
            self.assertEqual(service.project_id, "local")
            self.assertTrue(all(url.startswith("http://127.0.0.1:") for url in service.task_services.values()))

    def test_production_cannot_enable_local_auth_bypass(self) -> None:
        with patch.dict(
            os.environ,
            {"ENVIRONMENT": "production", "LOCAL_AUTH_BYPASS": "true"},
            clear=True,
        ):
            self.assertFalse(local_auth_enabled())

    def test_local_auth_bypass_requires_both_explicit_flags(self) -> None:
        configurations = (
            {},
            {"ENVIRONMENT": "local"},
            {"LOCAL_AUTH_BYPASS": "true"},
            {"ENVIRONMENT": "development", "LOCAL_AUTH_BYPASS": "true"},
        )
        for configuration in configurations:
            with self.subTest(configuration=configuration), patch.dict(os.environ, configuration, clear=True):
                self.assertFalse(local_auth_enabled())

        with patch.dict(
            os.environ,
            {"ENVIRONMENT": "local", "LOCAL_AUTH_BYPASS": "true"},
            clear=True,
        ):
            self.assertTrue(local_auth_enabled())


class LocalAuthTests(unittest.IsolatedAsyncioTestCase):
    def test_import_does_not_read_firebase_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            invalid_credentials = Path(directory) / "not-a-service-account.json"
            invalid_credentials.write_text("{}", encoding="utf-8")
            environment_variables = os.environ.copy()
            environment_variables.update(
                {
                    "ENVIRONMENT": "production",
                    "GOOGLE_APPLICATION_CREDENTIALS": str(invalid_credentials),
                }
            )

            result = subprocess.run(
                [sys.executable, "-c", "import dependencies.auth"],
                cwd=Path(__file__).resolve().parent.parent,
                env=environment_variables,
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stderr)

    async def test_missing_environment_rejects_the_fixed_development_token(self) -> None:
        token = HTTPAuthorizationCredentials(scheme="Bearer", credentials="cpaautomation-local-development")
        with patch.dict(os.environ, {"LOCAL_AUTH_BYPASS": "true"}, clear=True), patch(
            "dependencies.auth.firebase_auth.verify_id_token",
            side_effect=ValueError("not a Firebase token"),
        ):
            with self.assertRaises(HTTPException) as caught:
                await verify_firebase_token(token)
        self.assertEqual(caught.exception.status_code, 401)

    async def test_local_identity_accepts_only_the_fixed_development_token(self) -> None:
        with patch.dict(os.environ, {"ENVIRONMENT": "local", "LOCAL_AUTH_BYPASS": "true"}, clear=True):
            token = HTTPAuthorizationCredentials(scheme="Bearer", credentials="cpaautomation-local-development")
            decoded = await verify_firebase_token(token)
            self.assertEqual(decoded["uid"], "local-developer")
            self.assertEqual(decoded["email"], "local.developer@example.com")

            invalid = HTTPAuthorizationCredentials(scheme="Bearer", credentials="wrong")
            with self.assertRaises(HTTPException) as caught:
                await verify_firebase_token(invalid)
            self.assertEqual(caught.exception.status_code, 401)


class LocalStorageTests(unittest.TestCase):
    def test_filesystem_object_becomes_inline_gemini_part(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ,
            {
                "LOCAL_STORAGE_PATH": directory,
                "GCS_BUCKET_NAME": "local-bucket",
            },
            clear=False,
        ):
            service = LocalStorageService()
            service.bucket.blob("jobs/example/document.pdf").upload_from_string(b"pdf bytes")

            with patch(
                "services.gemini_file_service.types.Part.from_bytes",
                return_value=sentinel.gemini_part,
            ) as from_bytes:
                part = part_from_storage_object(
                    service,
                    "jobs/example/document.pdf",
                    "application/pdf",
                )

            self.assertIs(part, sentinel.gemini_part)
            from_bytes.assert_called_once_with(data=b"pdf bytes", mime_type="application/pdf")

    def test_signed_token_round_trip_and_filesystem_blob_api(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.dict(
            os.environ,
            {"LOCAL_STORAGE_SIGNING_KEY": "unit-test-key"},
            clear=False,
        ):
            token = create_local_storage_token(
                "PUT",
                "local-bucket",
                "jobs/example/document.txt",
                expires_in_seconds=60,
            )
            payload = verify_local_storage_token(token, "PUT")
            self.assertEqual(payload["o"], "jobs/example/document.txt")

            client = LocalStorageClient(Path(directory))
            blob = client.bucket(payload["b"]).blob(payload["o"])
            blob.upload_from_string(b"local bytes")
            self.assertTrue(blob.exists())
            self.assertEqual(blob.size, 11)
            self.assertEqual(blob.download_as_bytes(), b"local bytes")

    def test_local_blob_rejects_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            bucket = LocalStorageClient(Path(directory)).bucket("local-bucket")
            with self.assertRaises(ValueError):
                bucket.blob("../outside.txt")


if __name__ == "__main__":
    unittest.main()
