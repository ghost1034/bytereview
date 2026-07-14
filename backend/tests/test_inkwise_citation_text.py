from __future__ import annotations

import unittest
from types import SimpleNamespace

from inkwise.services.citation_text import parse_citation_text, split_stream_display_text, strip_citation_quote_payloads
from inkwise.services.writing_tools_service import build_grounded_prediction_prompt, build_grounded_writing_tool_prompt, build_writing_tool_prompt


def _evidence_item(evidence_id: str, excerpt: str, page_number: int = 2) -> SimpleNamespace:
    return SimpleNamespace(
        evidence_id=evidence_id,
        source_id="source-1",
        source_title="Lease",
        page_number=page_number,
        modality=None,
        segment_type=None,
        segment_id=None,
        segment_title=None,
        locator_json=None,
        preview_bucket=None,
        preview_object=None,
        excerpt=excerpt,
    )


class ParseCitationTextTests(unittest.TestCase):
    def test_extracts_segments_and_strips_markers(self) -> None:
        evidence = [
            SimpleNamespace(
                evidence_id="E01",
                source_id="source-1",
                source_title="Lease",
                page_number=2,
                modality=None,
                segment_type=None,
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
                modality=None,
                segment_type=None,
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
        self.assertEqual(
            parsed.content_with_citations,
            "The lease renews automatically.[E01#1] Either party may terminate with notice.[E02#1]",
        )
        self.assertEqual([item["evidence_id"] for item in parsed.citations], ["E01", "E02"])
        self.assertEqual(parsed.citations[0]["references"], [{"id": "E01#1", "highlight": None}])
        self.assertEqual(parsed.citations[1]["references"], [{"id": "E02#1", "highlight": None}])

    def test_merges_adjacent_marker_group_into_one_segment_anchor(self) -> None:
        evidence = [
            SimpleNamespace(
                evidence_id="E01",
                source_id="source-1",
                source_title="Lease",
                page_number=2,
                modality=None,
                segment_type=None,
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
                modality=None,
                segment_type=None,
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

    def test_pin_cited_quote_produces_highlight_offsets(self) -> None:
        excerpt = "Preamble text. The lease renews automatically each year unless terminated. Trailing text."
        evidence = [_evidence_item("E01", excerpt)]

        parsed = parse_citation_text(
            text='The lease renews on its own.[E01|"renews automatically each year"]',
            evidence=evidence,
        )

        self.assertEqual(parsed.plain_text, "The lease renews on its own.")
        self.assertEqual(parsed.content_with_citations, "The lease renews on its own.[E01#1]")
        self.assertEqual(len(parsed.citations), 1)
        highlights = parsed.citations[0]["highlights"]
        self.assertEqual(len(highlights), 1)
        start, end = highlights[0]["start"], highlights[0]["end"]
        self.assertEqual(excerpt[start:end], "renews automatically each year")
        self.assertEqual(parsed.citations[0]["references"], [{"id": "E01#1", "highlight": highlights[0]}])

    def test_pin_cited_quote_tolerates_whitespace_and_curly_quotes(self) -> None:
        excerpt = "The tenant’s deposit shall be\n  returned within thirty days."
        evidence = [_evidence_item("E01", excerpt)]

        parsed = parse_citation_text(
            text='Deposits come back within a month.[E01|"the tenant\'s deposit shall be returned"]',
            evidence=evidence,
        )

        highlights = parsed.citations[0]["highlights"]
        self.assertEqual(len(highlights), 1)
        start, end = highlights[0]["start"], highlights[0]["end"]
        self.assertEqual(excerpt[start:end], "The tenant’s deposit shall be\n  returned")

    def test_unverifiable_quote_is_dropped_but_citation_kept(self) -> None:
        evidence = [_evidence_item("E01", "renews automatically")]

        parsed = parse_citation_text(
            text='Claim.[E01|"words that are not in the excerpt"]',
            evidence=evidence,
        )

        self.assertEqual([item["evidence_id"] for item in parsed.citations], ["E01"])
        self.assertEqual(parsed.citations[0]["highlights"], [])
        self.assertEqual(parsed.content_with_citations, "Claim.[E01#1]")
        self.assertEqual(parsed.plain_text, "Claim.")
        self.assertEqual(parsed.citations[0]["references"], [{"id": "E01#1", "highlight": None}])

    def test_multiple_quotes_for_same_evidence_keep_occurrence_highlights(self) -> None:
        excerpt = "Rent is due on the first. Late fees accrue after five days. Notice must be written."
        evidence = [_evidence_item("E01", excerpt)]

        parsed = parse_citation_text(
            text='Rent timing.[E01|"Rent is due on the first"] Late penalty.[E01|"Late fees accrue after five days"]',
            evidence=evidence,
        )

        self.assertEqual(len(parsed.citations), 1)
        self.assertEqual(parsed.content_with_citations, "Rent timing.[E01#1] Late penalty.[E01#2]")
        highlights = parsed.citations[0]["highlights"]
        self.assertEqual(len(highlights), 2)
        self.assertEqual(excerpt[highlights[0]["start"] : highlights[0]["end"]], "Rent is due on the first")
        self.assertEqual(excerpt[highlights[1]["start"] : highlights[1]["end"]], "Late fees accrue after five days")
        references = parsed.citations[0]["references"]
        self.assertEqual([reference["id"] for reference in references], ["E01#1", "E01#2"])
        self.assertEqual(excerpt[references[0]["highlight"]["start"] : references[0]["highlight"]["end"]], "Rent is due on the first")
        self.assertEqual(excerpt[references[1]["highlight"]["start"] : references[1]["highlight"]["end"]], "Late fees accrue after five days")

    def test_unknown_evidence_id_keeps_bare_marker_and_drops_quote(self) -> None:
        evidence = [_evidence_item("E01", "renews automatically")]

        parsed = parse_citation_text(text='Claim.[E05|"stray quote"]', evidence=evidence)

        self.assertEqual(parsed.plain_text, "Claim.[E05]")
        self.assertEqual(parsed.content_with_citations, "Claim.[E05]")
        self.assertEqual(parsed.citations, [])


class StreamDisplayTextTests(unittest.TestCase):
    def test_strips_quote_payloads_from_complete_markers(self) -> None:
        self.assertEqual(
            strip_citation_quote_payloads('Before.[E01|"quoted words"] After.[E02]'),
            "Before.[E01] After.[E02]",
        )

    def test_holds_back_partial_marker_until_it_closes(self) -> None:
        display, holdback = split_stream_display_text('Rent is due.[E01|"Rent is')
        self.assertEqual(display, "Rent is due.")
        self.assertEqual(holdback, '[E01|"Rent is')

        display, holdback = split_stream_display_text(holdback + ' due on the first"] Next sentence')
        self.assertEqual(display, "[E01] Next sentence")
        self.assertEqual(holdback, "")

    def test_does_not_hold_back_non_marker_brackets(self) -> None:
        display, holdback = split_stream_display_text("See [section 4")
        self.assertEqual(display, "See [section 4")
        self.assertEqual(holdback, "")

    def test_final_flush_strips_and_releases_everything(self) -> None:
        display, holdback = split_stream_display_text('Tail.[E01|"unclosed', final=True)
        self.assertEqual(display, 'Tail.[E01|"unclosed')
        self.assertEqual(holdback, "")


class GroundedPromptMarkerTests(unittest.TestCase):
    def test_grounded_writing_tool_prompt_requests_inline_markers(self) -> None:
        prompt = build_grounded_writing_tool_prompt(
            body=SimpleNamespace(action="coherent", instruction="Improve coherence", selection_text="Text", surrounding_text=None),
            document=SimpleNamespace(language="English", init_prompt="Be precise"),
            evidence_pack="[E01] Evidence block",
        )

        self.assertIn("append the supporting evidence IDs immediately after", prompt)
        self.assertIn("[E01]", prompt)

    def test_writing_tool_prompt_includes_action_specific_guidance(self) -> None:
        prompt = build_writing_tool_prompt(
            body=SimpleNamespace(action="detailed", instruction="Add detail", selection_text="Text", surrounding_text=None),
            document=SimpleNamespace(language="English", init_prompt="Be precise"),
        )

        self.assertIn("Add relevant detail, specificity", prompt)

    def test_grounded_prediction_prompt_requests_inline_markers(self) -> None:
        prompt = build_grounded_prediction_prompt(
            body=SimpleNamespace(document_prefix_text="Before"),
            document=SimpleNamespace(language="English", init_prompt="Be precise", title="Lease"),
            evidence_pack="[E01] Evidence block",
        )

        self.assertIn("append the supporting evidence IDs immediately after", prompt)
        self.assertIn("[E01]", prompt)


if __name__ == "__main__":
    unittest.main()
