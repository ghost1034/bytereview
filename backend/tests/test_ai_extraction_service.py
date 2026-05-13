from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.extraction import FieldConfig
from services.ai_extraction_service import AIExtractionService


class AIExtractionServiceContinuationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = AIExtractionService()
        self.service.continuation_enabled = True
        self.service.continuation_max_rounds = 5
        self.service.continuation_tail_rows = 1
        self.service.continuation_max_rows_per_call = 2

    def _response(
        self,
        rows: list[list[object]],
        *,
        finish_reason: str = "STOP",
        output_tokens: int = 10,
    ) -> SimpleNamespace:
        return SimpleNamespace(
            parsed={"results": rows},
            text=None,
            candidates=[SimpleNamespace(finish_reason=finish_reason)],
            usage_metadata=SimpleNamespace(candidates_token_count=output_tokens),
        )

    def test_continuation_continues_on_full_batch_without_truncation(self) -> None:
        self.service.client = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=MagicMock(
                    side_effect=[
                        self._response([["initial"]], finish_reason="MAX_TOKENS"),
                        self._response([["continued-1"], ["continued-2"]], finish_reason="STOP", output_tokens=10),
                        self._response([["continued-3"]], finish_reason="STOP", output_tokens=10),
                    ]
                )
            )
        )
        fields = [FieldConfig(name="Name", data_type="Text", prompt="Extract name")]
        schema = self.service.create_tabular_json_schema(fields)
        config = self.service._config_for_continuation(schema)

        rows = self.service._generate_with_continuation(
            file_parts=[],
            prompt="Extract all rows.",
            columns_json='["Name"]',
            response_schema=schema,
            base_config=config,
            n_cols=1,
            label="test",
        )

        self.assertEqual(rows, [["initial"], ["continued-1"], ["continued-2"], ["continued-3"]])
        self.assertEqual(self.service.client.models.generate_content.call_count, 3)

    def test_continuation_stops_on_non_full_clean_batch(self) -> None:
        self.service.client = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=MagicMock(
                    side_effect=[
                        self._response([["initial"]], finish_reason="MAX_TOKENS"),
                        self._response([["continued-1"]], finish_reason="STOP", output_tokens=10),
                    ]
                )
            )
        )
        fields = [FieldConfig(name="Name", data_type="Text", prompt="Extract name")]
        schema = self.service.create_tabular_json_schema(fields)
        config = self.service._config_for_continuation(schema)

        rows = self.service._generate_with_continuation(
            file_parts=[],
            prompt="Extract all rows.",
            columns_json='["Name"]',
            response_schema=schema,
            base_config=config,
            n_cols=1,
            label="test",
        )

        self.assertEqual(rows, [["initial"], ["continued-1"]])
        self.assertEqual(self.service.client.models.generate_content.call_count, 2)


if __name__ == "__main__":
    unittest.main()
