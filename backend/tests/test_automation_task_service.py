from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from task_services import automation_task_service
from workers import worker


class _Request:
    def __init__(self, payload):
        self.payload = payload

    async def json(self):
        return self.payload


class _DbSession:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class AutomationTaskServiceGmailTests(unittest.IsolatedAsyncioTestCase):
    async def test_execute_task_dispatches_gmail_push_processing(self) -> None:
        notification_data = {"email_address": "ianstewart@cpaautomation.ai", "history_id": "123"}

        with patch.object(
            automation_task_service,
            "process_gmail_push_notification",
            new=AsyncMock(return_value={"status": "success"}),
        ) as process_task:
            result = await automation_task_service.execute_task(
                _Request({"task_type": "process_gmail_push_notification", "notification_data": notification_data})
            )

        self.assertEqual(result, {"success": True, "result": {"status": "success"}})
        process_task.assert_awaited_once_with({}, notification_data)

    async def test_execute_task_rejects_missing_gmail_notification_data(self) -> None:
        result = await automation_task_service.execute_task(
            _Request({"task_type": "process_gmail_push_notification"})
        )

        self.assertEqual(result, {"success": False, "error": "notification_data is required"})


class GmailPushWorkerTests(unittest.IsolatedAsyncioTestCase):
    async def test_process_gmail_push_notification_enqueues_matching_messages(self) -> None:
        db = _DbSession()
        message = {
            "message_id": "msg-1",
            "sender_email": "sender@example.com",
            "subject": "Documents",
            "attachments": [{"filename": "doc.pdf", "attachment_id": "att-1"}],
        }

        with patch.object(worker, "get_db", side_effect=lambda: iter([db])), \
            patch(
                "services.gmail_pubsub_service.gmail_pubsub_service.process_history_with_cursor",
                return_value=[message],
            ) as process_history, \
            patch(
                "services.gmail_pubsub_service.gmail_pubsub_service.get_user_id_from_sender_email",
                return_value="user-1",
            ) as get_user, \
            patch(
                "services.gmail_pubsub_service.gmail_pubsub_service.trigger_automations_for_email",
                new=AsyncMock(return_value={"success": True, "task_name": "automation-task"}),
            ) as trigger:
            result = await worker.process_gmail_push_notification({}, {"history_id": "123"})

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["processed_count"], 1)
        self.assertEqual(result["successful_count"], 1)
        process_history.assert_called_once_with(db)
        get_user.assert_called_once_with(db, "sender@example.com")
        trigger.assert_awaited_once_with(db, "user-1", message)


if __name__ == "__main__":
    unittest.main()
