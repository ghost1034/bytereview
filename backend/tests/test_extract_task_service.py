from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from task_services.extract_task_service import execute_task
from services.job_service import JobService


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

    async def test_enqueue_extraction_tasks_uses_staggered_delays(self) -> None:
        tasks = [SimpleNamespace(id=f"task-{index}") for index in range(5)]
        query = MagicMock()
        query.filter.return_value.order_by.return_value.all.return_value = tasks
        db = MagicMock()
        db.query.return_value = query

        service = JobService.__new__(JobService)
        with patch.object(service, "_get_session", return_value=db), patch.dict(
            os.environ,
            {
                "EXTRACTION_ENQUEUE_BATCH_SIZE": "2",
                "EXTRACTION_ENQUEUE_BATCH_DELAY_SECONDS": "15",
                "EXTRACTION_ENQUEUE_MAX_DELAY_SECONDS": "900",
                "EXTRACTION_ENQUEUE_JITTER_SECONDS": "0",
            },
        ), patch("services.job_service.cloud_run_task_service.enqueue_extraction_task", new_callable=AsyncMock) as enqueue:
            enqueue.side_effect = [f"cloud-task-{index}" for index in range(5)]

            await service._enqueue_extraction_tasks_for_processing("run-id")

        delays = [call.kwargs["delay_seconds"] for call in enqueue.await_args_list]
        self.assertEqual(delays, [0, 0, 15, 15, 30])
        db.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
