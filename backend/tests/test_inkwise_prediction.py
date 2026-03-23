from __future__ import annotations

import unittest
from types import SimpleNamespace

from inkwise.schemas import InkwisePredictionRequest
from inkwise.services.writing_tools_service import (
    build_grounded_prediction_prompt,
    build_prediction_prompt,
    normalize_prediction_result,
)


class NormalizePredictionResultTests(unittest.TestCase):
    def test_returns_first_line_and_truncates_length(self) -> None:
        body = InkwisePredictionRequest(before_text="Prior context that should stay intact.")

        result = normalize_prediction_result(raw_text="Next clause\nAnd another line", body=body)

        self.assertEqual(result.text, "Next clause")
        self.assertIsNone(result.reason)

    def test_rejects_duplicate_before_context(self) -> None:
        body = InkwisePredictionRequest(before_text="The quick brown fox")

        result = normalize_prediction_result(raw_text="The quick brown fox", body=body)

        self.assertEqual(result.text, "")
        self.assertEqual(result.reason, "duplicate_before_context")

    def test_rejects_duplicate_after_context(self) -> None:
        body = InkwisePredictionRequest(before_text="The quick brown fox", after_text=" jumps over the lazy dog")

        result = normalize_prediction_result(raw_text=" jumps over the lazy dog", body=body)

        self.assertEqual(result.text, "")
        self.assertEqual(result.reason, "duplicate_after_context")


class PredictionPromptTests(unittest.TestCase):
    def test_uses_cursor_aware_labels(self) -> None:
        body = InkwisePredictionRequest(
            before_text="The lease renews unless",
            current_block_text="The lease renews unless terminated early.",
            after_text=" terminated early.",
        )
        document = SimpleNamespace(title="Lease Summary", language="English", init_prompt="Keep it concise")

        prompt = build_prediction_prompt(body=body, document=document)
        grounded_prompt = build_grounded_prediction_prompt(body=body, document=document, evidence_pack="[E01] Renewal clause")

        self.assertIn("Current cursor block context:", prompt)
        self.assertIn("Text before cursor:", prompt)
        self.assertIn("Text after cursor:", prompt)
        self.assertIn("Current cursor block context:", grounded_prompt)
        self.assertIn("Text before cursor:", grounded_prompt)
        self.assertIn("Text after cursor:", grounded_prompt)


if __name__ == "__main__":
    unittest.main()
