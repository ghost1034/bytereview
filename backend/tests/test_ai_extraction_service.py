from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch, sentinel


os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.extraction import FieldConfig
from services.ai_extraction_service import AIExtractionService


class AIExtractionServiceContinuationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = AIExtractionService()
        self.service.batch_enabled = True
        self.service.batch_max_rounds = 5
        self.service.batch_tail_rows = 1
        self.service.batch_rows_per_call = 2

    def test_storage_object_is_used_for_gemini_file_part(self) -> None:
        storage_service = object()
        service = AIExtractionService(storage_service=storage_service)
        with patch(
            "services.ai_extraction_service.part_from_storage_object",
            return_value=sentinel.file_part,
        ) as build_part:
            part = service._part_from_file_data(
                {
                    "object_name": "jobs/example/document.pdf",
                    "uri": "local://local-bucket/jobs/example/document.pdf",
                    "mime_type": "application/pdf",
                }
            )

        self.assertIs(part, sentinel.file_part)
        build_part.assert_called_once_with(
            storage_service,
            "jobs/example/document.pdf",
            "application/pdf",
        )

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
        first_continuation_prompt = self.service.client.models.generate_content.call_args_list[1].kwargs["contents"][-1]
        second_continuation_prompt = self.service.client.models.generate_content.call_args_list[2].kwargs["contents"][-1]
        self.assertIn('prior_rows (all rows already returned, in order): [["initial"]]', first_continuation_prompt)
        self.assertIn(
            'prior_rows (all rows already returned, in order): [["initial"],["continued-1"],["continued-2"]]',
            second_continuation_prompt,
        )
        self.assertIn("Do not summarize, collapse, or omit rows", second_continuation_prompt)
        self.assertIn("Do not mention output limits or token limits", second_continuation_prompt)

    def test_batching_does_not_continue_on_clean_non_full_batch(self) -> None:
        self.service.client = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=MagicMock(
                    return_value=self._response([["first"]], finish_reason="STOP", output_tokens=10)
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

        self.assertEqual(rows, [["first"]])
        self.assertEqual(self.service.client.models.generate_content.call_count, 1)

    def test_batching_stops_on_empty_batch(self) -> None:
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

    def test_continuation_keeps_distinct_duplicate_rows(self) -> None:
        self.service.client = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=MagicMock(
                    side_effect=[
                        self._response([["same"]], finish_reason="MAX_TOKENS"),
                        self._response([["same"], ["next"]], finish_reason="STOP", output_tokens=10),
                        self._response([], finish_reason="STOP", output_tokens=10),
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

        self.assertEqual(rows, [["same"], ["same"], ["next"]])


if __name__ == "__main__":
    unittest.main()
