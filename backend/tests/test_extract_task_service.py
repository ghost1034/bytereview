from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from task_services.extract_task_service import execute_task


class FakeRequest:
    def __init__(self, payload: dict[str, object], headers: dict[str, str]) -> None:
        self._payload = payload
        self.headers = headers

    async def json(self) -> dict[str, object]:
        return self._payload


class ExtractTaskServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_process_form_fill_output_passes_cloud_tasks_retry_headers(self) -> None:
        request = FakeRequest(
            {
                "task_type": "process_form_fill_output",
                "run_id": "run-id",
                "output_id": "output-id",
            },
            {
                "X-CloudTasks-TaskRetryCount": "1",
                "X-CloudTasks-TaskExecutionCount": "2",
                "X-CloudTasks-TaskName": "task-name",
                "X-CloudTasks-QueueName": "extract-tasks",
            },
        )

        with patch("task_services.extract_task_service.form_fill_service") as service:
            service.process_output = AsyncMock(return_value={"success": True})

            result = await execute_task(request)

        self.assertEqual(result, {"success": True, "result": {"success": True}})
        service.process_output.assert_awaited_once_with(
            "run-id",
            "output-id",
            task_retry_count=1,
            task_execution_count=2,
            task_queue_name="extract-tasks",
            task_name="task-name",
        )


if __name__ == "__main__":
    unittest.main()
