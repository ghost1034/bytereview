from __future__ import annotations

import asyncio
import os
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite://")

from fastapi import HTTPException

from inkwise.routes.writing_tools import create_prediction
from inkwise.schemas import InkwisePredictionRequest
from inkwise.services.gemini import GeminiError


class _FakeRequest:
    def __init__(self, disconnected_values: list[bool]) -> None:
        self._values = list(disconnected_values)

    async def is_disconnected(self) -> bool:
        if self._values:
            return self._values.pop(0)
        return False


class PredictionRouteCancellationTests(unittest.IsolatedAsyncioTestCase):
    async def test_disconnect_before_retrieval_skips_retrieval_and_generation(self) -> None:
        document_id = uuid.uuid4()
        attempt_id = uuid.uuid4()
        body = InkwisePredictionRequest(current_block_prefix_text="The lease renews unless terminated.")
        request = _FakeRequest([True])

        with patch(
            "inkwise.routes.writing_tools.get_inkwise_settings",
            return_value=SimpleNamespace(gemini_model="gemini-test", prediction_timeout_seconds=60.0),
        ):
            with patch("inkwise.routes.writing_tools.document_service.get_document_or_404", return_value=SimpleNamespace(title="Lease Memo", language="English", init_prompt=None)):
                with patch("inkwise.routes.writing_tools.document_source_service.list_ready_bound_sources", return_value=[(uuid.uuid4(), "Lease.pdf")]):
                    with patch("inkwise.routes.writing_tools.generation_attempt_service.create_attempt", return_value=SimpleNamespace(id=attempt_id)):
                        with patch("inkwise.routes.writing_tools.generation_attempt_service.fail_attempt") as fail_attempt_mock:
                            with patch("inkwise.routes.writing_tools.retrieval_service.run_retrieval") as retrieval_mock:
                                with patch("inkwise.routes.writing_tools.generate_text", new=AsyncMock()) as generate_text_mock:
                                    with self.assertRaises(HTTPException) as exc:
                                        await create_prediction(
                                            document_id=document_id,
                                            body=body,
                                            request=request,
                                            token_data={"uid": "user-123"},
                                            db=MagicMock(),
                                        )

        self.assertEqual(exc.exception.status_code, 499)
        retrieval_mock.assert_not_called()
        generate_text_mock.assert_not_awaited()
        fail_attempt_mock.assert_called_once_with(
            unittest.mock.ANY,
            attempt_id=attempt_id,
            message="cancelled",
            retrieval_run_id=None,
            meta_json={"generation_started": False},
        )

    async def test_disconnect_after_retrieval_skips_generation(self) -> None:
        document_id = uuid.uuid4()
        attempt_id = uuid.uuid4()
        retrieval_run_id = uuid.uuid4()
        source_id = uuid.uuid4()
        body = InkwisePredictionRequest(current_block_prefix_text="The lease renews unless terminated.")
        request = _FakeRequest([False, True])

        with patch(
            "inkwise.routes.writing_tools.get_inkwise_settings",
            return_value=SimpleNamespace(gemini_model="gemini-test", prediction_timeout_seconds=60.0),
        ):
            with patch("inkwise.routes.writing_tools.document_service.get_document_or_404", return_value=SimpleNamespace(title="Lease Memo", language="English", init_prompt=None)):
                with patch("inkwise.routes.writing_tools.document_source_service.list_ready_bound_sources", return_value=[(source_id, "Lease.pdf")]):
                    with patch("inkwise.routes.writing_tools.generation_attempt_service.create_attempt", return_value=SimpleNamespace(id=attempt_id)):
                        with patch("inkwise.routes.writing_tools.generation_attempt_service.fail_attempt") as fail_attempt_mock:
                            with patch(
                                "inkwise.routes.writing_tools.retrieval_service.run_retrieval",
                                return_value=(SimpleNamespace(id=retrieval_run_id), []),
                            ) as retrieval_mock:
                                with patch("inkwise.routes.writing_tools.generate_text", new=AsyncMock()) as generate_text_mock:
                                    with patch("inkwise.routes.writing_tools.build_multimodal_contents") as multimodal_mock:
                                        with self.assertRaises(HTTPException) as exc:
                                            await create_prediction(
                                                document_id=document_id,
                                                body=body,
                                                request=request,
                                                token_data={"uid": "user-123"},
                                                db=MagicMock(),
                                            )

        self.assertEqual(exc.exception.status_code, 499)
        retrieval_mock.assert_called_once()
        multimodal_mock.assert_not_called()
        generate_text_mock.assert_not_awaited()
        fail_attempt_mock.assert_called_once_with(
            unittest.mock.ANY,
            attempt_id=attempt_id,
            message="cancelled",
            retrieval_run_id=retrieval_run_id,
            meta_json={"generation_started": False},
        )

    async def test_cancelled_generation_marks_attempt_cancelled(self) -> None:
        document_id = uuid.uuid4()
        attempt_id = uuid.uuid4()
        body = InkwisePredictionRequest(current_block_prefix_text="The lease renews unless terminated.")
        request = _FakeRequest([False, False, False])
        multimodal_bundle = SimpleNamespace(has_attachments=False, contents=[], attached_evidence_ids=[])

        with patch(
            "inkwise.routes.writing_tools.get_inkwise_settings",
            return_value=SimpleNamespace(gemini_model="gemini-test", prediction_timeout_seconds=60.0),
        ):
            with patch("inkwise.routes.writing_tools.document_service.get_document_or_404", return_value=SimpleNamespace(title="Lease Memo", language="English", init_prompt=None)):
                with patch("inkwise.routes.writing_tools.document_source_service.list_ready_bound_sources", return_value=[]):
                    with patch("inkwise.routes.writing_tools.generation_attempt_service.create_attempt", return_value=SimpleNamespace(id=attempt_id)):
                        with patch("inkwise.routes.writing_tools.generation_attempt_service.fail_attempt") as fail_attempt_mock:
                            with patch("inkwise.routes.writing_tools.build_multimodal_contents", return_value=multimodal_bundle):
                                with patch(
                                    "inkwise.routes.writing_tools.generate_text",
                                    new=AsyncMock(side_effect=asyncio.CancelledError()),
                                ) as generate_text_mock:
                                    with self.assertRaises(HTTPException) as exc:
                                        await create_prediction(
                                            document_id=document_id,
                                            body=body,
                                            request=request,
                                            token_data={"uid": "user-123"},
                                            db=MagicMock(),
                                        )

        self.assertEqual(exc.exception.status_code, 499)
        generate_text_mock.assert_awaited_once()
        fail_attempt_mock.assert_called_once_with(
            unittest.mock.ANY,
            attempt_id=attempt_id,
            message="cancelled",
            retrieval_run_id=None,
            meta_json={"generation_started": True},
        )

    async def test_provider_error_marks_attempt_failed(self) -> None:
        document_id = uuid.uuid4()
        attempt_id = uuid.uuid4()
        body = InkwisePredictionRequest(current_block_prefix_text="The lease renews unless terminated.")
        request = _FakeRequest([False, False, False])
        multimodal_bundle = SimpleNamespace(has_attachments=False, contents=[], attached_evidence_ids=[])

        with patch(
            "inkwise.routes.writing_tools.get_inkwise_settings",
            return_value=SimpleNamespace(gemini_model="gemini-test", prediction_timeout_seconds=60.0),
        ):
            with patch("inkwise.routes.writing_tools.document_service.get_document_or_404", return_value=SimpleNamespace(title="Lease Memo", language="English", init_prompt=None)):
                with patch("inkwise.routes.writing_tools.document_source_service.list_ready_bound_sources", return_value=[]):
                    with patch("inkwise.routes.writing_tools.generation_attempt_service.create_attempt", return_value=SimpleNamespace(id=attempt_id)):
                        with patch("inkwise.routes.writing_tools.generation_attempt_service.fail_attempt") as fail_attempt_mock:
                            with patch("inkwise.routes.writing_tools.generation_attempt_service.complete_attempt") as complete_attempt_mock:
                                with patch("inkwise.routes.writing_tools.build_multimodal_contents", return_value=multimodal_bundle):
                                    with patch(
                                        "inkwise.routes.writing_tools.generate_text",
                                        new=AsyncMock(side_effect=GeminiError("Vertex AI request timed out")),
                                    ):
                                        with self.assertRaises(HTTPException) as exc:
                                            await create_prediction(
                                                document_id=document_id,
                                                body=body,
                                                request=request,
                                                token_data={"uid": "user-123"},
                                                db=MagicMock(),
                                            )

        self.assertEqual(exc.exception.status_code, 502)
        complete_attempt_mock.assert_not_called()
        fail_attempt_mock.assert_called_once_with(
            unittest.mock.ANY,
            attempt_id=attempt_id,
            message="Vertex AI request timed out",
            retrieval_run_id=None,
            meta_json={"generation_started": True},
        )

    async def test_post_generation_error_marks_attempt_failed(self) -> None:
        document_id = uuid.uuid4()
        attempt_id = uuid.uuid4()
        body = InkwisePredictionRequest(current_block_prefix_text="The lease renews unless terminated.")
        request = _FakeRequest([False, False, False, False])
        multimodal_bundle = SimpleNamespace(has_attachments=False, contents=[], attached_evidence_ids=[])

        with patch(
            "inkwise.routes.writing_tools.get_inkwise_settings",
            return_value=SimpleNamespace(gemini_model="gemini-test", prediction_timeout_seconds=60.0),
        ):
            with patch("inkwise.routes.writing_tools.document_service.get_document_or_404", return_value=SimpleNamespace(title="Lease Memo", language="English", init_prompt=None)):
                with patch("inkwise.routes.writing_tools.document_source_service.list_ready_bound_sources", return_value=[]):
                    with patch("inkwise.routes.writing_tools.generation_attempt_service.create_attempt", return_value=SimpleNamespace(id=attempt_id)):
                        with patch("inkwise.routes.writing_tools.generation_attempt_service.fail_attempt") as fail_attempt_mock:
                            with patch("inkwise.routes.writing_tools.generation_attempt_service.complete_attempt") as complete_attempt_mock:
                                with patch("inkwise.routes.writing_tools.build_multimodal_contents", return_value=multimodal_bundle):
                                    with patch(
                                        "inkwise.routes.writing_tools.generate_text",
                                        new=AsyncMock(return_value=SimpleNamespace(text="Next clause")),
                                    ):
                                        with patch(
                                            "inkwise.routes.writing_tools.parse_citation_text",
                                            side_effect=RuntimeError("parse boom"),
                                        ):
                                            with self.assertRaises(HTTPException) as exc:
                                                await create_prediction(
                                                    document_id=document_id,
                                                    body=body,
                                                    request=request,
                                                    token_data={"uid": "user-123"},
                                                    db=MagicMock(),
                                                )

        self.assertEqual(exc.exception.status_code, 500)
        complete_attempt_mock.assert_not_called()
        fail_attempt_mock.assert_called_once_with(
            unittest.mock.ANY,
            attempt_id=attempt_id,
            message="parse boom",
            retrieval_run_id=None,
            meta_json={"generation_started": True},
        )


if __name__ == "__main__":
    unittest.main()
