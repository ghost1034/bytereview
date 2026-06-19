from __future__ import annotations

import os
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite://")

from inkwise.routes.writing_tools import _stream_writing_tool_attempt
from inkwise.schemas import InkwiseWritingToolRequest
from inkwise.settings import get_inkwise_settings


class _FakeRequest:
    async def is_disconnected(self) -> bool:
        return False


async def _fake_text_stream(*_args, **_kwargs):
    yield SimpleNamespace(text="Rewritten clause.")


class ThinkingLevelDefaultsTests(unittest.TestCase):
    def test_defaults_are_low(self) -> None:
        with patch.dict(os.environ, {}, clear=False):
            for var in (
                "INKWISE_PREDICTION_THINKING_LEVEL",
                "INKWISE_CHAT_THINKING_LEVEL",
                "INKWISE_WRITING_TOOL_THINKING_LEVEL",
            ):
                os.environ.pop(var, None)
            settings = get_inkwise_settings()
        self.assertEqual(settings.prediction_thinking_level, "LOW")
        self.assertEqual(settings.chat_thinking_level, "LOW")
        self.assertEqual(settings.writing_tool_thinking_level, "LOW")

    def test_env_overrides_are_respected(self) -> None:
        with patch.dict(
            os.environ,
            {
                "INKWISE_PREDICTION_THINKING_LEVEL": "high",
                "INKWISE_CHAT_THINKING_LEVEL": "medium",
                "INKWISE_WRITING_TOOL_THINKING_LEVEL": "minimal",
            },
            clear=False,
        ):
            settings = get_inkwise_settings()
        self.assertEqual(settings.prediction_thinking_level, "HIGH")
        self.assertEqual(settings.chat_thinking_level, "MEDIUM")
        self.assertEqual(settings.writing_tool_thinking_level, "MINIMAL")


class WritingToolThinkingLevelTests(unittest.IsolatedAsyncioTestCase):
    async def test_writing_tool_stream_passes_thinking_level_to_text_generation(self) -> None:
        attempt_id = uuid.uuid4()
        body = InkwiseWritingToolRequest(
            action="coherent",
            selection_text="The lease renews.",
            surrounding_text="The lease renews.",
            instruction="Make it clearer",
        )
        multimodal_bundle = SimpleNamespace(has_attachments=False, contents=[], attached_evidence_ids=[])
        settings = SimpleNamespace(gemini_model="gemini-test", writing_tool_thinking_level="LOW")

        with patch("inkwise.routes.writing_tools.build_multimodal_contents", return_value=multimodal_bundle):
            with patch(
                "inkwise.routes.writing_tools.generate_text_stream",
                MagicMock(side_effect=_fake_text_stream),
            ) as generate_text_stream_mock:
                with patch(
                    "inkwise.routes.writing_tools.parse_citation_text",
                    return_value=SimpleNamespace(
                        plain_text="Rewritten clause.",
                        citations=[],
                        segments=[],
                        content_with_citations="Rewritten clause.",
                    ),
                ):
                    with patch("inkwise.routes.writing_tools.generation_attempt_service.complete_attempt"):
                        chunks = [
                            chunk
                            async for chunk in _stream_writing_tool_attempt(
                                db=MagicMock(),
                                request=_FakeRequest(),
                                settings=settings,
                                user_id="user-123",
                                body=body,
                                document=None,
                                scoped_sources=[],
                                attempt_id=attempt_id,
                                fresh_retrieval=True,
                                reuse_retrieval_run_id=None,
                                attempt_meta={},
                            )
                        ]

        self.assertTrue(chunks)
        generate_text_stream_mock.assert_called_once()
        self.assertEqual(
            generate_text_stream_mock.call_args.kwargs["generation_config"],
            {"thinking_config": {"thinking_level": "LOW"}},
        )


if __name__ == "__main__":
    unittest.main()
