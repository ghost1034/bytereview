from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.runtime import storage_backend, task_backend
from dependencies.auth import verify_firebase_token
from services.cloud_run_task_service import CloudRunTaskService
from services.local_storage_service import (
    LocalStorageClient,
    create_local_storage_token,
    verify_local_storage_token,
)


class LocalRuntimeTests(unittest.TestCase):
    def test_non_production_defaults_do_not_select_cloud_backends(self) -> None:
        with patch.dict(os.environ, {"ENVIRONMENT": "local"}, clear=True):
            self.assertEqual(storage_backend(), "local")
            self.assertEqual(task_backend(), "local")

            service = CloudRunTaskService()
            self.assertEqual(service.backend, "local")
            self.assertEqual(service.project_id, "local")
            self.assertTrue(all(url.startswith("http://127.0.0.1:") for url in service.task_services.values()))

    def test_production_cannot_enable_local_auth_bypass(self) -> None:
        from core.runtime import local_auth_enabled

        with patch.dict(
            os.environ,
            {"ENVIRONMENT": "production", "LOCAL_AUTH_BYPASS": "true"},
            clear=True,
        ):
            self.assertFalse(local_auth_enabled())


class LocalAuthTests(unittest.IsolatedAsyncioTestCase):
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
