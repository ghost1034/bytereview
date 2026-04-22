from __future__ import annotations

import unittest

from inkwise.services.reference_metadata_service import InkwiseReferenceMetadataService


class InkwiseReferenceMetadataServiceTests(unittest.TestCase):
    def test_parse_response_uses_nested_title_as_suggested_title(self) -> None:
        service = InkwiseReferenceMetadataService()

        parsed = service._parse_response(
            '{"bibliographic_metadata":{"title":"Lease Agreement","authors":["Jane Smith"],"year":"2024","unknown":"x"}}'
        )

        self.assertEqual(parsed.suggested_title, "Lease Agreement")
        self.assertEqual(parsed.bibliographic_metadata, {"authors": ["Jane Smith"], "year": "2024"})

    def test_parse_response_normalizes_string_people_lists(self) -> None:
        service = InkwiseReferenceMetadataService()

        parsed = service._parse_response(
            '{"suggested_title":"Memo","bibliographic_metadata":{"citation_type":"ARTICLE","authors":"Jane Smith; John Doe","editors":"Editor One\\nEditor Two"}}'
        )

        self.assertEqual(parsed.suggested_title, "Memo")
        self.assertEqual(
            parsed.bibliographic_metadata,
            {
                "citation_type": "article",
                "authors": ["Jane Smith", "John Doe"],
                "editors": ["Editor One", "Editor Two"],
            },
        )


if __name__ == "__main__":
    unittest.main()
