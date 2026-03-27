from __future__ import annotations

import unittest
from types import SimpleNamespace

from inkwise.services.citation_text import parse_citation_text
from inkwise.services.writing_tools_service import build_grounded_prediction_prompt, build_grounded_writing_tool_prompt


class ParseCitationTextTests(unittest.TestCase):
    def test_extracts_segments_and_strips_markers(self) -> None:
        evidence = [
            SimpleNamespace(
                evidence_id="E01",
                source_id="source-1",
                source_title="Lease",
                page_number=2,
                segment_id=None,
                segment_title=None,
                locator_json=None,
                preview_bucket=None,
                preview_object=None,
                excerpt="renews automatically",
            ),
            SimpleNamespace(
                evidence_id="E02",
                source_id="source-1",
                source_title="Lease",
                page_number=3,
                segment_id=None,
                segment_title=None,
                locator_json=None,
                preview_bucket=None,
                preview_object=None,
                excerpt="30 days notice",
            ),
        ]

        parsed = parse_citation_text(
            text="The lease renews automatically.[E01] Either party may terminate with notice.[E02]",
            evidence=evidence,
        )

        self.assertEqual(
            parsed.plain_text,
            "The lease renews automatically. Either party may terminate with notice.",
        )
        self.assertEqual(parsed.segments, [
            {"text": "The lease renews automatically.", "citation_ids": ["E01"]},
            {"text": " Either party may terminate with notice.", "citation_ids": ["E02"]},
        ])
        self.assertEqual([item["evidence_id"] for item in parsed.citations], ["E01", "E02"])

    def test_merges_adjacent_marker_group_into_one_segment_anchor(self) -> None:
        evidence = [
            SimpleNamespace(
                evidence_id="E01",
                source_id="source-1",
                source_title="Lease",
                page_number=2,
                segment_id=None,
                segment_title=None,
                locator_json=None,
                preview_bucket=None,
                preview_object=None,
                excerpt="renews automatically",
            ),
            SimpleNamespace(
                evidence_id="E02",
                source_id="source-1",
                source_title="Lease",
                page_number=3,
                segment_id=None,
                segment_title=None,
                locator_json=None,
                preview_bucket=None,
                preview_object=None,
                excerpt="30 days notice",
            ),
        ]

        parsed = parse_citation_text(text="Supported text.[E01][E02]", evidence=evidence)

        self.assertEqual(parsed.segments, [{"text": "Supported text.", "citation_ids": ["E01", "E02"]}])


class GroundedPromptMarkerTests(unittest.TestCase):
    def test_grounded_writing_tool_prompt_requests_inline_markers(self) -> None:
        prompt = build_grounded_writing_tool_prompt(
            body=SimpleNamespace(action="improve", instruction="Improve", selection_text="Text", surrounding_text=None),
            document=SimpleNamespace(language="English", init_prompt="Be precise"),
            evidence_pack="[E01] Evidence block",
        )

        self.assertIn("append the supporting evidence IDs immediately after", prompt)
        self.assertIn("[E01]", prompt)

    def test_grounded_prediction_prompt_requests_inline_markers(self) -> None:
        prompt = build_grounded_prediction_prompt(
            body=SimpleNamespace(before_text="Before", after_text=None, current_block_text="Before"),
            document=SimpleNamespace(language="English", init_prompt="Be precise", title="Lease"),
            evidence_pack="[E01] Evidence block",
        )

        self.assertIn("append the supporting evidence IDs immediately after", prompt)
        self.assertIn("[E01]", prompt)


if __name__ == "__main__":
    unittest.main()
