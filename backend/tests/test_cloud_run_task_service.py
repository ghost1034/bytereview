from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.cloud_run_task_service import CloudRunTaskService


class CloudRunTaskServiceStaggerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = CloudRunTaskService()

    def _delay(self, index: int, seed: str = "seed") -> int:
        return self.service.calculate_stagger_delay(
            index,
            batch_size_env="TEST_BATCH_SIZE",
            batch_delay_env="TEST_BATCH_DELAY_SECONDS",
            max_delay_env="TEST_MAX_DELAY_SECONDS",
            jitter_env="TEST_JITTER_SECONDS",
            jitter_seed=seed,
        )

    def test_stagger_delay_batches_without_jitter(self) -> None:
        with patch.dict(
            os.environ,
            {
                "TEST_BATCH_SIZE": "5",
                "TEST_BATCH_DELAY_SECONDS": "15",
                "TEST_MAX_DELAY_SECONDS": "900",
                "TEST_JITTER_SECONDS": "0",
            },
        ):
            self.assertEqual(self._delay(0), 0)
            self.assertEqual(self._delay(4), 0)
            self.assertEqual(self._delay(5), 15)
            self.assertEqual(self._delay(9), 15)
            self.assertEqual(self._delay(10), 30)

    def test_stagger_delay_caps_max_delay(self) -> None:
        with patch.dict(
            os.environ,
            {
                "TEST_BATCH_SIZE": "5",
                "TEST_BATCH_DELAY_SECONDS": "15",
                "TEST_MAX_DELAY_SECONDS": "30",
                "TEST_JITTER_SECONDS": "0",
            },
        ):
            self.assertEqual(self._delay(100), 30)

    def test_stagger_jitter_is_stable_and_skips_first_batch(self) -> None:
        with patch.dict(
            os.environ,
            {
                "TEST_BATCH_SIZE": "5",
                "TEST_BATCH_DELAY_SECONDS": "15",
                "TEST_MAX_DELAY_SECONDS": "900",
                "TEST_JITTER_SECONDS": "5",
            },
        ):
            self.assertEqual(self._delay(0, seed="same"), 0)
            first = self._delay(5, seed="same")
            second = self._delay(5, seed="same")
            self.assertEqual(first, second)
            self.assertGreaterEqual(first, 15)
            self.assertLessEqual(first, 20)


if __name__ == "__main__":
    unittest.main()
