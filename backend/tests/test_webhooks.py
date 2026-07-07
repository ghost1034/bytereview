from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routes import webhooks


class _Request:
    def __init__(self, payload):
        self.payload = payload

    async def json(self):
        return self.payload


class GmailWebhookTests(unittest.IsolatedAsyncioTestCase):
    async def test_gmail_push_webhook_enqueues_history_processing(self) -> None:
        body = {"message": {"data": "encoded"}}
        notification_data = {"email_address": "ianstewart@cpaautomation.ai", "history_id": "123"}

        with patch.object(
            webhooks.gmail_pubsub_service,
            "process_push_notification",
            return_value=notification_data,
        ) as process_push, patch.object(
            webhooks.gmail_pubsub_service,
            "process_history_with_cursor",
        ) as process_history, patch.object(
            webhooks.cloud_run_task_service,
            "enqueue_gmail_history_processing_task",
            new=AsyncMock(return_value="task-name"),
        ) as enqueue_task:
            result = await webhooks.gmail_push_webhook(_Request(body), _=None)

        self.assertEqual(result, {"status": "accepted", "task_name": "task-name", "history_id": "123"})
        process_push.assert_called_once_with(body)
        process_history.assert_not_called()
        enqueue_task.assert_awaited_once_with(notification_data)


if __name__ == "__main__":
    unittest.main()
