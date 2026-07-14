from __future__ import annotations

import unittest

from inkwise.services.document_citations import content_json_to_html, refresh_document_citations
from inkwise.services.exporter import content_to_text


class RefreshDocumentCitationsTests(unittest.TestCase):
    def test_default_note_citations_exclude_source_excerpt(self) -> None:
        content_json = {
            "type": "doc",
            "content": [
                {
                    "type": "inkwiseNoteDefinition",
                    "attrs": {
                        "noteId": "footnote-1",
                        "noteKind": "footnote",
                        "noteNumber": 1,
                        "citationStyle": "default",
                        "citations": [
                            {
                                "evidence_id": "E01",
                                "source_id": "source-1",
                                "source_title": "Source Title",
                                "page_number": 3,
                                "excerpt": "Referenced source text chunk.",
                                "bibliographic_metadata": {},
                            }
                        ],
                    },
                    "content": [{"type": "text", "text": "Old reference"}],
                },
                {
                    "type": "inkwiseNoteDefinition",
                    "attrs": {
                        "noteId": "endnote-1",
                        "noteKind": "endnote",
                        "noteNumber": 2,
                        "citationStyle": "default",
                        "citations": [
                            {
                                "evidence_id": "E02",
                                "source_id": "source-2",
                                "source_title": "Another Source",
                                "page_number": 8,
                                "excerpt": "Another referenced source text chunk.",
                                "bibliographic_metadata": {},
                            }
                        ],
                    },
                    "content": [{"type": "text", "text": "Old reference"}],
                },
            ],
        }

        refreshed, changed = refresh_document_citations(
            content_json=content_json,
            citation_style="default",
            source_map={},
        )

        self.assertTrue(changed)
        self.assertEqual(refreshed["content"][0]["content"][0]["text"], "Source Title p.3")
        self.assertEqual(refreshed["content"][1]["content"][0]["text"], "Another Source p.8")

    def test_refreshes_semantic_inline_and_note_citations(self) -> None:
        content_json = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "Supported sentence"},
                        {
                            "type": "inkwiseInlineCitation",
                            "attrs": {
                                "citationStyle": "default",
                                "label": "(Old Source p.3)",
                                "citations": [
                                    {
                                        "evidence_id": "E01",
                                        "source_id": "source-1",
                                        "source_title": "Old Source",
                                        "page_number": 3,
                                        "bibliographic_metadata": {},
                                    }
                                ],
                            },
                        },
                        {
                            "type": "inkwiseCitationAnchor",
                            "attrs": {
                                "sourceKind": "chat",
                                "citationStyle": "default",
                                "citations": [
                                    {
                                        "evidence_id": "E01",
                                        "source_id": "source-1",
                                        "source_title": "Old Source",
                                        "page_number": 3,
                                        "bibliographic_metadata": {},
                                    }
                                ],
                            },
                        },
                    ],
                },
                {
                    "type": "inkwiseNoteDefinition",
                    "attrs": {
                        "noteId": "note-1",
                        "noteKind": "footnote",
                        "noteNumber": 1,
                        "citationStyle": "default",
                        "citations": [
                            {
                                "evidence_id": "E01",
                                "source_id": "source-1",
                                "source_title": "Old Source",
                                "page_number": 3,
                                "bibliographic_metadata": {},
                            }
                        ],
                    },
                    "content": [{"type": "text", "text": "Old Source p.3: old excerpt"}],
                },
            ],
        }

        refreshed, changed = refresh_document_citations(
            content_json=content_json,
            citation_style="apa",
            source_map={
                "source-1": {
                    "title": "Updated Source",
                    "bibliographic_metadata": {
                        "authors": ["Jane Smith"],
                        "year": "2024",
                    },
                }
            },
        )

        self.assertTrue(changed)
        paragraph = refreshed["content"][0]
        inline_citation = paragraph["content"][1]
        anchor = paragraph["content"][2]
        note_definition = refreshed["content"][1]

        self.assertEqual(inline_citation["attrs"]["label"], "(Smith, 2024, p. 3)")
        self.assertEqual(anchor["attrs"]["citations"][0]["source_title"], "Updated Source")
        self.assertEqual(note_definition["content"][0]["text"], "Jane Smith. (2024). Updated Source. p. 3.")

    def test_renders_updated_semantic_citations_to_text_and_html(self) -> None:
        content_json = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "Body text"},
                        {
                            "type": "inkwiseInlineCitation",
                            "attrs": {
                                "citationStyle": "mla",
                                "label": "(Smith 3)",
                                "citations": [
                                    {
                                        "evidence_id": "E01",
                                        "source_id": "source-1",
                                        "source_title": "Updated Source",
                                        "page_number": 3,
                                        "bibliographic_metadata": {
                                            "authors": ["Jane Smith"],
                                            "year": "2024",
                                        },
                                    }
                                ],
                            },
                        },
                    ],
                },
                {
                    "type": "inkwiseNoteDefinition",
                    "attrs": {
                        "noteId": "note-1",
                        "noteKind": "footnote",
                        "noteNumber": 1,
                        "citationStyle": "mla",
                        "citations": [
                            {
                                "evidence_id": "E01",
                                "source_id": "source-1",
                                "source_title": "Updated Source",
                                "page_number": 3,
                                "bibliographic_metadata": {
                                    "authors": ["Jane Smith"],
                                    "year": "2024",
                                },
                            }
                        ],
                    },
                    "content": [{"type": "text", "text": "Jane Smith, Updated Source, 2024, p.3"}],
                },
            ],
        }

        text_value = content_to_text(content_html=None, content_json=content_json)
        html_value = content_json_to_html(content_json)

        self.assertIn("(Smith 3)", text_value)
        self.assertIn("[^1]: Jane Smith, Updated Source, 2024, p.3", text_value)
        self.assertIn("<span data-inkwise-inline-citation=\"true\">(Smith 3)</span>", html_value)

    def test_no_citation_needed_preserves_existing_reference_text(self) -> None:
        content_json = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "Body text"},
                        {
                            "type": "inkwiseInlineCitation",
                            "attrs": {
                                "citationStyle": "default",
                                "label": "(Legacy Source p.3)",
                                "citations": [
                                    {
                                        "evidence_id": "E01",
                                        "source_id": "source-1",
                                        "source_title": "Legacy Source",
                                        "page_number": 3,
                                        "bibliographic_metadata": {},
                                    }
                                ],
                            },
                        },
                    ],
                },
                {
                    "type": "inkwiseNoteDefinition",
                    "attrs": {
                        "noteId": "note-1",
                        "noteKind": "footnote",
                        "noteNumber": 1,
                        "citationStyle": "default",
                        "citations": [
                            {
                                "evidence_id": "E01",
                                "source_id": "source-1",
                                "source_title": "Legacy Source",
                                "page_number": 3,
                                "bibliographic_metadata": {},
                            }
                        ],
                    },
                    "content": [{"type": "text", "text": "Legacy Source p.3: legacy excerpt"}],
                },
            ],
        }

        refreshed, changed = refresh_document_citations(
            content_json=content_json,
            citation_style="none",
            source_map={
                "source-1": {
                    "title": "Updated Source",
                    "bibliographic_metadata": {
                        "authors": ["Jane Smith"],
                        "year": "2024",
                    },
                }
            },
        )

        self.assertTrue(changed)
        inline_citation = refreshed["content"][0]["content"][1]
        note_definition = refreshed["content"][1]

        self.assertEqual(inline_citation["attrs"]["citationStyle"], "none")
        self.assertEqual(inline_citation["attrs"]["label"], "(Legacy Source p.3)")
        self.assertEqual(inline_citation["attrs"]["citations"][0]["source_title"], "Updated Source")
        self.assertEqual(note_definition["attrs"]["citationStyle"], "none")
        self.assertEqual(note_definition["content"][0]["text"], "Legacy Source p.3: legacy excerpt")

    def test_no_citation_needed_exports_existing_reference_text(self) -> None:
        content_json = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "Body text"},
                        {
                            "type": "inkwiseInlineCitation",
                            "attrs": {
                                "citationStyle": "none",
                                "label": "(Legacy Source p.3)",
                                "citations": [
                                    {
                                        "evidence_id": "E01",
                                        "source_id": "source-1",
                                        "source_title": "Updated Source",
                                        "page_number": 3,
                                        "bibliographic_metadata": {
                                            "authors": ["Jane Smith"],
                                            "year": "2024",
                                        },
                                    }
                                ],
                            },
                        },
                    ],
                },
                {
                    "type": "inkwiseNoteDefinition",
                    "attrs": {
                        "noteId": "note-1",
                        "noteKind": "footnote",
                        "noteNumber": 1,
                        "citationStyle": "none",
                        "citations": [
                            {
                                "evidence_id": "E01",
                                "source_id": "source-1",
                                "source_title": "Updated Source",
                                "page_number": 3,
                                "bibliographic_metadata": {
                                    "authors": ["Jane Smith"],
                                    "year": "2024",
                                },
                            }
                        ],
                    },
                    "content": [{"type": "text", "text": "Legacy Source p.3: legacy excerpt"}],
                },
            ],
        }

        text_value = content_to_text(content_html=None, content_json=content_json)
        html_value = content_json_to_html(content_json)

        self.assertIn("(Legacy Source p.3)", text_value)
        self.assertIn("[^1]: Legacy Source p.3: legacy excerpt", text_value)
        self.assertIn("<span data-inkwise-inline-citation=\"true\">(Legacy Source p.3)</span>", html_value)


if __name__ == "__main__":
    unittest.main()
