from __future__ import annotations

import unittest
from types import SimpleNamespace

from inkwise.services.citation_pages import CitationSourcePage, refine_citation_page_locators
from inkwise.services.citation_styles import format_inline_citation
from inkwise.services.citation_text import parse_citation_text


def _parse_citation(excerpt: str, response: str) -> list[dict]:
    evidence = [
        SimpleNamespace(
            evidence_id="E01",
            source_id="source-1",
            source_title="Lease",
            page_number=2,
            modality="text",
            segment_type="text_chunk",
            segment_id=None,
            segment_title="Lease pp.2-4",
            locator_json={"kind": "page_range", "page_start": 2, "page_end": 4},
            preview_bucket=None,
            preview_object=None,
            excerpt=excerpt,
            bibliographic_metadata=None,
        )
    ]
    return parse_citation_text(text=response, evidence=evidence).citations


class CitationPageResolutionTests(unittest.TestCase):
    def test_resolves_quote_to_page_containing_snippet(self) -> None:
        citations = _parse_citation(
            "Introductory language. The lease renews automatically each year. Closing language.",
            'The lease renews.[E01|"renews automatically each year"]',
        )

        refined = refine_citation_page_locators(
            citations=citations,
            pages_by_source={
                "source-1": [
                    CitationSourcePage(2, "Introductory language."),
                    CitationSourcePage(3, "The lease renews automatically each year."),
                    CitationSourcePage(4, "Closing language."),
                ]
            },
        )

        citation = refined[0]
        self.assertEqual(citation["page_number"], 3)
        self.assertEqual(citation["locator_json"]["page_numbers"], [3])
        self.assertEqual(citation["references"][0]["page_number"], 3)
        self.assertEqual(citation["references"][0]["locator_json"]["page_start"], 3)

    def test_resolves_quote_spanning_adjacent_pages(self) -> None:
        citations = _parse_citation(
            "The security deposit shall be returned within thirty days after termination.",
            'Deposits are returned promptly.[E01|"deposit shall be returned within thirty days"]',
        )

        refined = refine_citation_page_locators(
            citations=citations,
            pages_by_source={
                "source-1": [
                    CitationSourcePage(2, "Unrelated text."),
                    CitationSourcePage(3, "The security deposit shall be"),
                    CitationSourcePage(4, "returned within thirty days after termination."),
                ]
            },
        )

        locator = refined[0]["references"][0]["locator_json"]
        self.assertEqual(locator["page_numbers"], [3, 4])
        self.assertEqual((locator["page_start"], locator["page_end"]), (3, 4))

    def test_keeps_chunk_locator_when_quote_is_ambiguous(self) -> None:
        citations = _parse_citation(
            "Payment is due monthly.",
            'Payments recur.[E01|"Payment is due monthly"]',
        )

        refined = refine_citation_page_locators(
            citations=citations,
            pages_by_source={
                "source-1": [
                    CitationSourcePage(2, "Payment is due monthly."),
                    CitationSourcePage(3, "Payment is due monthly."),
                    CitationSourcePage(4, "Other text."),
                ]
            },
        )

        citation = refined[0]
        self.assertEqual(citation["page_number"], 2)
        self.assertEqual(citation["locator_json"], {"kind": "page_range", "page_start": 2, "page_end": 4})
        self.assertNotIn("page_number", citation["references"][0])

    def test_multiple_references_get_occurrence_specific_pages(self) -> None:
        citations = _parse_citation(
            "Rent is due on the first. Late fees accrue after five days.",
            'Rent timing.[E01|"Rent is due on the first"] Late fees.[E01|"Late fees accrue after five days"]',
        )

        refined = refine_citation_page_locators(
            citations=citations,
            pages_by_source={
                "source-1": [
                    CitationSourcePage(2, "Rent is due on the first."),
                    CitationSourcePage(3, "Unrelated text."),
                    CitationSourcePage(4, "Late fees accrue after five days."),
                ]
            },
        )

        citation = refined[0]
        self.assertEqual([reference["page_number"] for reference in citation["references"]], [2, 4])
        self.assertEqual(citation["locator_json"]["page_numbers"], [2, 4])
        self.assertEqual(format_inline_citation([citation], "default"), " (Lease pp.2, 4)")

    def test_unresolved_reference_prevents_top_level_narrowing(self) -> None:
        citations = _parse_citation(
            "Rent is due on the first. Other clause text.",
            'Rent timing.[E01|"Rent is due on the first"] Other point.[E01]',
        )

        refined = refine_citation_page_locators(
            citations=citations,
            pages_by_source={
                "source-1": [
                    CitationSourcePage(2, "Rent is due on the first."),
                    CitationSourcePage(3, "Other clause text."),
                    CitationSourcePage(4, "Closing text."),
                ]
            },
        )

        citation = refined[0]
        self.assertEqual(citation["locator_json"], {"kind": "page_range", "page_start": 2, "page_end": 4})
        self.assertEqual(citation["references"][0]["page_number"], 2)
        self.assertNotIn("page_number", citation["references"][1])


if __name__ == "__main__":
    unittest.main()
