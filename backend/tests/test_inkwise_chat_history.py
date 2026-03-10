from __future__ import annotations

import unittest
from types import SimpleNamespace

from inkwise.services.chat_service import build_grounded_chat_prompt, prepare_grounded_chat_history


class PrepareGroundedChatHistoryTests(unittest.TestCase):
    def test_strips_stale_citations_from_assistant_messages(self) -> None:
        history, meta = prepare_grounded_chat_history(
            history_messages=[
                {"role": "user", "content": "What does the lease say?"},
                {"role": "assistant", "content": "It renews automatically [E01] and can end early [E02]."},
            ],
            max_messages=6,
            max_chars=500,
        )

        self.assertEqual(meta["message_count"], 2)
        self.assertEqual(history[1]["content"], "It renews automatically and can end early.")

    def test_keeps_most_recent_messages_within_char_budget(self) -> None:
        history, meta = prepare_grounded_chat_history(
            history_messages=[
                {"role": "user", "content": "first message"},
                {"role": "assistant", "content": "second message"},
                {"role": "user", "content": "third message"},
            ],
            max_messages=3,
            max_chars=len("second message") + len("third message"),
        )

        self.assertEqual(history, [
            {"role": "assistant", "content": "second message"},
            {"role": "user", "content": "third message"},
        ])
        self.assertTrue(meta["truncated"])


class BuildGroundedChatPromptTests(unittest.TestCase):
    def test_includes_history_block_and_guardrails(self) -> None:
        prompt = build_grounded_chat_prompt(
            question="What about that exception?",
            document=SimpleNamespace(language="English", init_prompt="Summarize the agreement"),
            evidence_pack="[E01] Exception text",
            allowed_ids=["E01"],
            draft_selection_text=None,
            history_messages=[
                {"role": "user", "content": "Tell me about termination."},
                {"role": "assistant", "content": "Termination needs notice."},
            ],
        )

        self.assertIn("Recent thread history (context only; not evidence):", prompt)
        self.assertIn("User:\nTell me about termination.", prompt)
        self.assertIn("Assistant:\nTermination needs notice.", prompt)
        self.assertIn("If it conflicts with the evidence below, follow the evidence.", prompt)
        self.assertIn("Do not cite the recent thread history", prompt)


if __name__ == "__main__":
    unittest.main()
