from __future__ import annotations

import unittest
from types import SimpleNamespace

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


if __name__ == '__main__':
    unittest.main()
