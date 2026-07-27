from __future__ import annotations

import os
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("DATABASE_URL", "sqlite://")

from inkwise.routes.chat import (
    _auto_name_thread_after_response,
    _maybe_auto_name_thread,
    _schedule_thread_auto_name_after_response,
)
from inkwise.services.chat_service import build_thread_title_prompt, normalize_thread_title_candidate


class ThreadTitleHelperTests(unittest.TestCase):
    def test_normalize_thread_title_candidate_strips_noise(self) -> None:
        self.assertEqual(normalize_thread_title_candidate('  "Lease termination summary."  '), 'Lease termination summary')

    def test_normalize_thread_title_candidate_limits_length(self) -> None:
        value = normalize_thread_title_candidate('This is an intentionally long thread title that should be trimmed before it grows too long to store cleanly')

        self.assertIsNotNone(value)
        self.assertLessEqual(len(str(value)), 80)

    def test_build_thread_title_prompt_includes_document_context(self) -> None:
        prompt = build_thread_title_prompt(
            document=SimpleNamespace(title='Lease Memo', init_prompt='Summarize key risks'),
            user_message='What termination rights does the tenant have?',
        )

        self.assertIn('Document title: Lease Memo', prompt)
        self.assertIn('User message:', prompt)


class ThreadAutoNameRouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_maybe_auto_name_thread_uses_model_output_cap(self) -> None:
        with patch(
            "inkwise.routes.chat.generate_text",
            new=AsyncMock(return_value=SimpleNamespace(text="Lease termination summary")),
        ) as generate_text_mock:
            with patch("inkwise.routes.chat.chat_service.update_thread_title") as update_thread_title_mock:
                details = await _maybe_auto_name_thread(
                    db=SimpleNamespace(),
                    settings=SimpleNamespace(grounded_model="gemini-test"),
                    thread=SimpleNamespace(title=None),
                    document=SimpleNamespace(title="Lease Memo", init_prompt=None),
                    user_message="What termination rights does the tenant have?",
                )

        self.assertTrue(details.get("updated"))
        update_thread_title_mock.assert_called_once()
        self.assertEqual(generate_text_mock.await_args.kwargs["max_output_tokens"], 65536)

    async def test_auto_name_thread_after_response_closes_session_on_failure(self) -> None:
        fake_db = MagicMock()
        fake_thread = SimpleNamespace(title=None, document_id="doc-123")

        with patch("inkwise.routes.chat.db_config.get_session", return_value=fake_db):
            with patch("inkwise.routes.chat.chat_service.get_thread_or_404", return_value=fake_thread):
                with patch("inkwise.routes.chat.chat_service.get_document_or_404", return_value=SimpleNamespace()):
                    with patch("inkwise.routes.chat._maybe_auto_name_thread", new=AsyncMock(side_effect=RuntimeError("boom"))):
                        await _auto_name_thread_after_response(
                            user_id="user-123",
                            thread_id=uuid.uuid4(),
                            user_message="Need a title",
                        )

        fake_db.close.assert_called_once()

    def test_schedule_thread_auto_name_after_response_skips_named_threads(self) -> None:
        with patch("inkwise.routes.chat.asyncio.create_task") as create_task_mock:
            _schedule_thread_auto_name_after_response(
                thread=SimpleNamespace(title="Named thread"),
                user_id="user-123",
                thread_id=uuid.uuid4(),
                user_message="Need a title",
            )

        create_task_mock.assert_not_called()


if __name__ == '__main__':
    unittest.main()
