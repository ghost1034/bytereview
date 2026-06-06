from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.exc import IntegrityError

from services.user_service import DuplicatePhoneNumberError, UserService


class GetEnrolledMfaPhoneNumberTests(unittest.TestCase):
    """Pins the firebase_admin accounts:lookup payload shape (_data["mfaInfo"]).

    firebase_admin 7.0.0 has no public MFA accessor on UserRecord, so
    get_enrolled_mfa_phone_number reads the raw payload. If an SDK upgrade
    changes that shape, these tests catch it.
    """

    def _get(self, record=None, error=None):
        from dependencies import auth

        if error is not None:
            get_user = MagicMock(side_effect=error)
        else:
            get_user = MagicMock(return_value=record)
        with patch.object(auth.firebase_auth, "get_user", get_user):
            return auth.get_enrolled_mfa_phone_number("uid-123")

    def test_returns_phone_from_mfa_enrollment(self) -> None:
        record = SimpleNamespace(
            phone_number=None,
            _data={"mfaInfo": [{"mfaEnrollmentId": "enr-1", "phoneInfo": "+15551234567"}]},
        )
        self.assertEqual(self._get(record=record), "+15551234567")

    def test_prefers_account_phone_for_phone_auth_users(self) -> None:
        record = SimpleNamespace(phone_number="+15550001111", _data={})
        self.assertEqual(self._get(record=record), "+15550001111")

    def test_returns_none_when_no_mfa_enrollments(self) -> None:
        record = SimpleNamespace(phone_number=None, _data={"mfaInfo": []})
        self.assertIsNone(self._get(record=record))

    def test_returns_none_when_mfa_factor_has_no_phone(self) -> None:
        record = SimpleNamespace(phone_number=None, _data={"mfaInfo": [{"mfaEnrollmentId": "enr-1"}]})
        self.assertIsNone(self._get(record=record))

    def test_returns_none_instead_of_raising_on_firebase_error(self) -> None:
        self.assertIsNone(self._get(error=RuntimeError("firebase down")))


class ApplyVerifiedPhoneTests(unittest.TestCase):
    def _service(self) -> UserService:
        with patch.object(UserService, "__init__", return_value=None):
            return UserService()

    def test_first_record_sets_phone_and_verified_at(self) -> None:
        pg_user = SimpleNamespace(phone_number=None, phone_verified_at=None)
        self._service()._apply_verified_phone(pg_user, "+15551234567")
        self.assertEqual(pg_user.phone_number, "+15551234567")
        self.assertIsNotNone(pg_user.phone_verified_at)

    def test_repeat_sync_with_same_phone_does_not_restamp(self) -> None:
        original_stamp = datetime(2026, 1, 1, tzinfo=timezone.utc)
        pg_user = SimpleNamespace(phone_number="+15551234567", phone_verified_at=original_stamp)
        self._service()._apply_verified_phone(pg_user, "+15551234567")
        self.assertEqual(pg_user.phone_verified_at, original_stamp)

    def test_changed_phone_restamps_verified_at(self) -> None:
        original_stamp = datetime(2026, 1, 1, tzinfo=timezone.utc)
        pg_user = SimpleNamespace(phone_number="+15551234567", phone_verified_at=original_stamp)
        self._service()._apply_verified_phone(pg_user, "+15559876543")
        self.assertEqual(pg_user.phone_number, "+15559876543")
        self.assertNotEqual(pg_user.phone_verified_at, original_stamp)


class SyncUserProfilePhoneResolveTests(unittest.IsolatedAsyncioTestCase):
    def _service(self) -> UserService:
        with patch.object(UserService, "__init__", return_value=None):
            return UserService()

    async def test_resolver_not_called_when_phone_already_recorded(self) -> None:
        service = self._service()
        existing = SimpleNamespace(phone_number="+15551234567")
        service.get_user = AsyncMock(return_value=existing)
        service.update_user = AsyncMock(return_value=existing)
        resolver = MagicMock(return_value="+15551234567")

        await service.sync_user_profile("uid-123", "a@b.com", resolve_phone_number=resolver)

        resolver.assert_not_called()
        user_update = service.update_user.await_args.args[1]
        self.assertIsNone(user_update.phone_number)
        self.assertIsNone(user_update.phone_verified_at)

    async def test_resolver_called_once_when_phone_missing(self) -> None:
        service = self._service()
        existing = SimpleNamespace(phone_number=None)
        service.get_user = AsyncMock(return_value=existing)
        service.update_user = AsyncMock(return_value=existing)
        resolver = MagicMock(return_value="+15551234567")

        await service.sync_user_profile("uid-123", "a@b.com", resolve_phone_number=resolver)

        resolver.assert_called_once()
        user_update = service.update_user.await_args.args[1]
        self.assertEqual(user_update.phone_number, "+15551234567")
        # _apply_verified_phone owns the timestamp; sync must not pre-stamp it
        self.assertIsNone(user_update.phone_verified_at)

    async def test_resolver_called_on_create_path(self) -> None:
        service = self._service()
        service.get_user = AsyncMock(return_value=None)
        service.create_user = AsyncMock(return_value=SimpleNamespace())
        resolver = MagicMock(return_value="+15551234567")

        await service.sync_user_profile("uid-123", "a@b.com", resolve_phone_number=resolver)

        resolver.assert_called_once()
        user_create = service.create_user.await_args.args[0]
        self.assertEqual(user_create.phone_number, "+15551234567")
        self.assertIsNotNone(user_create.phone_verified_at)

    async def test_get_or_create_skips_resolver_for_existing_user(self) -> None:
        service = self._service()
        existing = SimpleNamespace(phone_number=None)
        service.get_user = AsyncMock(return_value=existing)
        resolver = MagicMock(return_value="+15551234567")

        result = await service.get_or_create_user("uid-123", "a@b.com", resolve_phone_number=resolver)

        self.assertIs(result, existing)
        resolver.assert_not_called()

    async def test_get_or_create_resolves_on_create(self) -> None:
        service = self._service()
        service.get_user = AsyncMock(return_value=None)
        service.create_user = AsyncMock(return_value=SimpleNamespace())
        resolver = MagicMock(return_value="+15551234567")

        await service.get_or_create_user("uid-123", "a@b.com", resolve_phone_number=resolver)

        resolver.assert_called_once()
        user_create = service.create_user.await_args.args[0]
        self.assertEqual(user_create.phone_number, "+15551234567")


class DuplicatePhoneConflictTests(unittest.IsolatedAsyncioTestCase):
    async def test_update_user_raises_duplicate_phone_error(self) -> None:
        with patch.object(UserService, "__init__", return_value=None):
            service = UserService()

        pg_user = SimpleNamespace(
            phone_number=None,
            phone_verified_at=None,
            display_name=None,
            photo_url=None,
            updated_at=None,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = pg_user
        db.commit.side_effect = IntegrityError(
            "INSERT", {}, Exception('duplicate key value violates unique constraint "uq_users_phone_number" (phone_number)')
        )
        service._get_session = MagicMock(return_value=db)

        from models.user import UserUpdate

        with self.assertRaises(DuplicatePhoneNumberError):
            await service.update_user("uid-123", UserUpdate(phone_number="+15551234567"))
        db.rollback.assert_called_once()


if __name__ == "__main__":
    unittest.main()
