from __future__ import annotations

import os
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite://")

from inkwise.routes.writing_tools import create_prediction
from inkwise.schemas import InkwisePredictionRequest


class _FakeRequest:
    async def is_disconnected(self) -> bool:
        return False


class PredictionRouteThinkingTests(unittest.IsolatedAsyncioTestCase):
    async def test_prediction_passes_thinking_level_to_text_generation(self) -> None:
        document_id = uuid.uuid4()
        attempt_id = uuid.uuid4()
        body = InkwisePredictionRequest(current_block_prefix_text="The lease renews unless terminated.")
        multimodal_bundle = SimpleNamespace(has_attachments=False, contents=[], attached_evidence_ids=[])

        with patch(
            "inkwise.routes.writing_tools.get_inkwise_settings",
            return_value=SimpleNamespace(
                gemini_model="gemini-test",
                prediction_timeout_seconds=60.0,
                prediction_thinking_level="MINIMAL",
            ),
        ):
            with patch("inkwise.routes.writing_tools.document_service.get_document_or_404", return_value=SimpleNamespace(title="Lease Memo", language="English", init_prompt=None)):
                with patch("inkwise.routes.writing_tools.document_source_service.list_ready_bound_sources", return_value=[]):
                    with patch("inkwise.routes.writing_tools.generation_attempt_service.create_attempt", return_value=SimpleNamespace(id=attempt_id)):
                        with patch("inkwise.routes.writing_tools.generation_attempt_service.complete_attempt"):
                            with patch("inkwise.routes.writing_tools.build_multimodal_contents", return_value=multimodal_bundle):
                                with patch(
                                    "inkwise.routes.writing_tools.generate_text",
                                    new=AsyncMock(return_value=SimpleNamespace(text="Next clause")),
                                ) as generate_text_mock:
                                    with patch(
                                        "inkwise.routes.writing_tools.parse_citation_text",
                                        return_value=SimpleNamespace(
                                            plain_text="Next clause",
                                            citations=[],
                                            segments=[],
                                            content_with_citations="Next clause",
                                        ),
                                    ):
                                        response = await create_prediction(
                                            document_id=document_id,
                                            body=body,
                                            request=_FakeRequest(),
                                            token_data={"uid": "user-123"},
                                            db=MagicMock(),
                                        )

        self.assertEqual(response.suggestion_text, "Next clause")
        generate_text_mock.assert_awaited_once()
        self.assertEqual(
            generate_text_mock.await_args.kwargs["generation_config"],
            {"thinking_config": {"thinking_level": "MINIMAL"}},
        )

    async def test_prediction_passes_thinking_level_to_multimodal_generation(self) -> None:
        document_id = uuid.uuid4()
        attempt_id = uuid.uuid4()
        body = InkwisePredictionRequest(current_block_prefix_text="The lease renews unless terminated.")
        multimodal_bundle = SimpleNamespace(
            has_attachments=True,
            contents=[{"role": "user", "parts": [{"text": "Continue this sentence"}]}],
            attached_evidence_ids=["E01"],
        )

        with patch(
            "inkwise.routes.writing_tools.get_inkwise_settings",
            return_value=SimpleNamespace(
                gemini_model="gemini-test",
                prediction_timeout_seconds=60.0,
                prediction_thinking_level="MINIMAL",
            ),
        ):
            with patch("inkwise.routes.writing_tools.document_service.get_document_or_404", return_value=SimpleNamespace(title="Lease Memo", language="English", init_prompt=None)):
                with patch("inkwise.routes.writing_tools.document_source_service.list_ready_bound_sources", return_value=[]):
                    with patch("inkwise.routes.writing_tools.generation_attempt_service.create_attempt", return_value=SimpleNamespace(id=attempt_id)):
                        with patch("inkwise.routes.writing_tools.generation_attempt_service.complete_attempt"):
                            with patch("inkwise.routes.writing_tools.build_multimodal_contents", return_value=multimodal_bundle):
                                with patch(
                                    "inkwise.routes.writing_tools.generate_content",
                                    new=AsyncMock(return_value=SimpleNamespace(text="Next clause")),
                                ) as generate_content_mock:
                                    with patch(
                                        "inkwise.routes.writing_tools.parse_citation_text",
                                        return_value=SimpleNamespace(
                                            plain_text="Next clause",
                                            citations=[],
                                            segments=[],
                                            content_with_citations="Next clause",
                                        ),
                                    ):
                                        response = await create_prediction(
                                            document_id=document_id,
                                            body=body,
                                            request=_FakeRequest(),
                                            token_data={"uid": "user-123"},
                                            db=MagicMock(),
                                        )

        self.assertEqual(response.suggestion_text, "Next clause")
        generate_content_mock.assert_awaited_once()
        self.assertEqual(
            generate_content_mock.await_args.kwargs["generation_config"],
            {
                "temperature": 0.2,
                "max_output_tokens": 65536,
                "thinking_config": {"thinking_level": "MINIMAL"},
            },
        )


if __name__ == "__main__":
    unittest.main()
