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
    def test_returns_full_first_line_without_truncation(self) -> None:
        body = InkwisePredictionRequest(document_prefix_text="Prior context that should stay intact.")
        long_line = "Next clause " + ("with more detail " * 30).strip()

        result = normalize_prediction_result(raw_text=f"{long_line}\nAnd another line", body=body)

        self.assertEqual(result.text, long_line)
        self.assertIsNone(result.reason)

    def test_rejects_duplicate_document_prefix(self) -> None:
        body = InkwisePredictionRequest(document_prefix_text="The quick brown fox")

        result = normalize_prediction_result(raw_text="The quick brown fox", body=body)

        self.assertEqual(result.text, "")
        self.assertEqual(result.reason, "duplicate_document_prefix")


class PredictionPromptTests(unittest.TestCase):
    def test_uses_cursor_aware_labels(self) -> None:
        body = InkwisePredictionRequest(
            document_prefix_text="The lease renews unless",
        )
        document = SimpleNamespace(title="Lease Summary", language="English", init_prompt="Keep it concise")

        prompt = build_prediction_prompt(body=body, document=document)
        grounded_prompt = build_grounded_prediction_prompt(body=body, document=document, evidence_pack="[E01] Renewal clause")

        self.assertIn("Document text before cursor:", prompt)
        self.assertIn("Document text before cursor:", grounded_prompt)
        self.assertNotIn("Current block text before cursor:", prompt)
        self.assertNotIn("Text after cursor:", prompt)
        self.assertNotIn("Current block text before cursor:", grounded_prompt)
        self.assertNotIn("Text after cursor:", grounded_prompt)

    def test_prediction_prompt_allows_multiple_sentences_and_targets_document(self) -> None:
        body = InkwisePredictionRequest(document_prefix_text="The lease renews unless")
        document = SimpleNamespace(title="Lease Summary", language="English", init_prompt="Keep it concise")

        prompt = build_prediction_prompt(body=body, document=document)
        grounded_prompt = build_grounded_prediction_prompt(body=body, document=document, evidence_pack="[E01] Renewal clause")

        self.assertIn("Continue the document text naturally from the cursor position.", prompt)
        self.assertIn("Extend exactly from where the document text stops.", prompt)
        self.assertIn("The completion may be several sentences when that is the natural continuation", prompt)
        self.assertIn("Continue the document text naturally from the cursor position.", grounded_prompt)
        self.assertIn("Extend exactly from where the document text stops.", grounded_prompt)
        self.assertIn("The completion may be several sentences when that is the natural continuation", grounded_prompt)


if __name__ == "__main__":
    unittest.main()
