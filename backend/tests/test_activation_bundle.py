from __future__ import annotations

import os
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi import HTTPException

from models.activation import BundleRequest, ResolveRequest
from routes.activation import _hash_key, bundle, resolve

TEST_KEY = "cpaa_live_abcdefghijklmnopqrstuvwxyz012345"


def _fake_request() -> SimpleNamespace:
    return SimpleNamespace(headers={}, client=SimpleNamespace(host="203.0.113.7"))


def _fake_key_row() -> SimpleNamespace:
    return SimpleNamespace(
        user_id="user-123",
        key_lookup="abcdefghijkl",
        key_hash=_hash_key(TEST_KEY),
        key_prefix="cpaa_live_abcd…",
        revoked_at=None,
        last_resolved_at=None,
        last_resolved_fingerprint=None,
        last_resolved_install_type=None,
        resolve_count=0,
    )


def _db_returning(row) -> MagicMock:
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = row
    return db


class ActivationBundleTests(unittest.IsolatedAsyncioTestCase):
    async def test_valid_key_returns_signed_url_and_stamps_desktop(self) -> None:
        row = _fake_key_row()
        db = _db_returning(row)

        with patch("routes.activation.db_config.get_session", return_value=db):
            with patch("routes.activation.rate_limiter.check", return_value=True):
                with patch.dict(os.environ, {"CPAA_BUNDLE_GCS_BUCKET": "test-bucket"}):
                    with patch(
                        "routes.activation.get_bundle_signed_url",
                        return_value=("https://signed.example/bundle", "deadbeef", "0.1.0"),
                    ) as sign_mock:
                        resp = await bundle(
                            BundleRequest(activation_key=TEST_KEY, fingerprint="my-host"),
                            _fake_request(),
                        )

        self.assertEqual(resp.bundle_url, "https://signed.example/bundle")
        self.assertEqual(resp.sha256, "deadbeef")
        self.assertEqual(resp.version, "0.1.0")
        self.assertEqual(resp.expires_in_seconds, 15 * 60)
        self.assertEqual(row.last_resolved_install_type, "desktop")
        self.assertEqual(row.last_resolved_fingerprint, "my-host")
        self.assertEqual(row.resolve_count, 1)
        self.assertIsNotNone(row.last_resolved_at)
        db.commit.assert_called_once()
        sign_mock.assert_called_once()
        self.assertEqual(sign_mock.call_args.args[0], "test-bucket")

    async def test_unknown_key_returns_401(self) -> None:
        db = _db_returning(None)

        with patch("routes.activation.db_config.get_session", return_value=db):
            with patch("routes.activation.rate_limiter.check", return_value=True):
                with patch.dict(os.environ, {"CPAA_BUNDLE_GCS_BUCKET": "test-bucket"}):
                    with self.assertRaises(HTTPException) as exc:
                        await bundle(
                            BundleRequest(activation_key=TEST_KEY),
                            _fake_request(),
                        )

        self.assertEqual(exc.exception.status_code, 401)
        db.commit.assert_not_called()

    async def test_hash_mismatch_returns_401(self) -> None:
        row = _fake_key_row()
        row.key_hash = _hash_key("cpaa_live_some_other_key_entirely_000000")
        db = _db_returning(row)

        with patch("routes.activation.db_config.get_session", return_value=db):
            with patch("routes.activation.rate_limiter.check", return_value=True):
                with patch.dict(os.environ, {"CPAA_BUNDLE_GCS_BUCKET": "test-bucket"}):
                    with self.assertRaises(HTTPException) as exc:
                        await bundle(
                            BundleRequest(activation_key=TEST_KEY),
                            _fake_request(),
                        )

        self.assertEqual(exc.exception.status_code, 401)

    async def test_missing_bucket_config_returns_503(self) -> None:
        row = _fake_key_row()
        db = _db_returning(row)

        env = {k: v for k, v in os.environ.items() if k != "CPAA_BUNDLE_GCS_BUCKET"}
        with patch("routes.activation.db_config.get_session", return_value=db):
            with patch("routes.activation.rate_limiter.check", return_value=True):
                with patch.dict(os.environ, env, clear=True):
                    with self.assertRaises(HTTPException) as exc:
                        await bundle(
                            BundleRequest(activation_key=TEST_KEY),
                            _fake_request(),
                        )

        self.assertEqual(exc.exception.status_code, 503)

    async def test_signing_failure_returns_503(self) -> None:
        row = _fake_key_row()
        db = _db_returning(row)

        with patch("routes.activation.db_config.get_session", return_value=db):
            with patch("routes.activation.rate_limiter.check", return_value=True):
                with patch.dict(os.environ, {"CPAA_BUNDLE_GCS_BUCKET": "test-bucket"}):
                    with patch(
                        "routes.activation.get_bundle_signed_url",
                        side_effect=Exception("object not found"),
                    ):
                        with self.assertRaises(HTTPException) as exc:
                            await bundle(
                                BundleRequest(activation_key=TEST_KEY),
                                _fake_request(),
                            )

        self.assertEqual(exc.exception.status_code, 503)
        db.commit.assert_not_called()

    async def test_ip_rate_limit_returns_429(self) -> None:
        with patch("routes.activation.rate_limiter.check", return_value=False):
            with self.assertRaises(HTTPException) as exc:
                await bundle(
                    BundleRequest(activation_key=TEST_KEY),
                    _fake_request(),
                )

        self.assertEqual(exc.exception.status_code, 429)

    def test_bundle_request_defaults_to_desktop(self) -> None:
        req = BundleRequest(activation_key=TEST_KEY)
        self.assertEqual(req.install_type, "desktop")


class ActivationResolveInstallTypeTests(unittest.IsolatedAsyncioTestCase):
    async def test_resolve_defaults_to_docker_install_type(self) -> None:
        row = _fake_key_row()
        db = _db_returning(row)

        with patch("routes.activation.db_config.get_session", return_value=db):
            with patch("routes.activation.rate_limiter.check", return_value=True):
                with patch.dict(os.environ, {"CPAA_BUNDLE_SECRET": "shh-bundle-secret"}):
                    resp = await resolve(
                        ResolveRequest(activation_key=TEST_KEY, fingerprint="machine-1"),
                        _fake_request(),
                    )

        self.assertEqual(resp.bundle_secret, "shh-bundle-secret")
        self.assertEqual(row.last_resolved_install_type, "docker")
        self.assertEqual(row.resolve_count, 1)
        db.commit.assert_called_once()

    def test_resolve_request_defaults_to_docker(self) -> None:
        req = ResolveRequest(activation_key=TEST_KEY)
        self.assertEqual(req.install_type, "docker")


if __name__ == "__main__":
    unittest.main()
