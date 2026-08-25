from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.job_service import JobService
from workers.worker import _record_usage_for_task


class CpePageUsageTests(unittest.IsolatedAsyncioTestCase):
    async def test_cpe_run_skips_page_limit_check(self) -> None:
        db = MagicMock()
        job_type_query = MagicMock()
        job_type_query.join.return_value.filter.return_value.scalar.return_value = "cpe"
        db.query.return_value = job_type_query

        with patch("services.billing_service.get_billing_service") as get_billing_service:
            await JobService()._check_job_run_plan_limits(db, "run-id", "user-id")

        get_billing_service.assert_not_called()
        self.assertEqual(db.query.call_count, 1)

    async def test_cpe_task_does_not_record_page_usage(self) -> None:
        db = MagicMock()
        job_run_query = MagicMock()
        job_run_query.filter.return_value.first.return_value = SimpleNamespace(job_id="job-id")
        job_query = MagicMock()
        job_query.filter.return_value.first.return_value = SimpleNamespace(
            id="job-id",
            user_id="user-id",
            job_type="cpe",
        )
        db.query.side_effect = [job_run_query, job_query]
        task = SimpleNamespace(id="task-id", job_run_id="run-id")
        source_files = [SimpleNamespace(id="file-id", page_count=10)]

        with patch("services.billing_service.get_billing_service") as get_billing_service:
            await _record_usage_for_task(db, task, source_files)

        get_billing_service.assert_not_called()
        self.assertEqual(db.query.call_count, 2)


if __name__ == "__main__":
    unittest.main()
