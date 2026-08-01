import unittest

import fitz
from pydantic import ValidationError

from models.esign import EsignAiFieldPlacementCreateRequest, EsignAiFieldPlacementProposal
from services.esign.ai_field_placement_service import (
    _overlap_duplicate,
    parse_ai_field_placement_response,
)
from services.pdf_anchor import resolve_contextual_anchor_rect


class EsignAiFieldPlacementParsingTests(unittest.TestCase):
    def test_parser_omits_unsupported_and_malformed_suggestions(self) -> None:
        proposals, warnings = parse_ai_field_placement_response({"proposals": [
            {"field_type": "signature", "anchor_text": "Sign here"},
            {"field_type": "dropdown", "anchor_text": "Choose"},
            "bad",
        ]})
        self.assertEqual([item["field_type"] for item in proposals], ["signature"])
        self.assertEqual(len(warnings), 2)

    def test_active_document_scope_requires_document(self) -> None:
        with self.assertRaises(ValidationError):
            EsignAiFieldPlacementCreateRequest(scope="active_document", expected_revision=1)

    def test_proposal_rejects_out_of_bounds_geometry(self) -> None:
        with self.assertRaises(ValidationError):
            EsignAiFieldPlacementProposal(
                id="p1", document_id="d1", participant_id="r1", field_type="text",
                page_number=0, pos_x=.9, pos_y=.2, width=.2, height=.03, required=True,
            )

    def test_overlap_uses_half_of_smaller_matching_field(self) -> None:
        first = {"document_id": "d", "participant_id": "r", "field_type": "signature", "page_number": 0,
                 "pos_x": .1, "pos_y": .1, "width": .2, "height": .1}
        second = {**first, "pos_x": .19}
        self.assertTrue(_overlap_duplicate(first, second))
        self.assertFalse(_overlap_duplicate(first, {**second, "participant_id": "another"}))


class ContextualAnchorTests(unittest.TestCase):
    def test_repeated_anchor_without_context_is_ambiguous(self) -> None:
        pdf = fitz.open(); page = pdf.new_page()
        page.insert_text((72, 72), "Signature")
        page.insert_text((72, 144), "Signature")
        rect, warning = resolve_contextual_anchor_rect(page, {"anchor_text": "Signature"})
        self.assertIsNone(rect)
        self.assertIn("ambiguous", warning or "")
        pdf.close()

    def test_context_selects_one_repeated_anchor(self) -> None:
        pdf = fitz.open(); page = pdf.new_page()
        page.insert_text((72, 60), "Client")
        page.insert_text((72, 72), "Signature")
        page.insert_text((72, 132), "Partner")
        page.insert_text((72, 144), "Signature")
        rect, warning = resolve_contextual_anchor_rect(page, {"anchor_text": "Signature", "anchor_before": "Partner"})
        self.assertIsNotNone(rect)
        self.assertIsNone(warning)
        self.assertGreater(rect.y0, 100)
        pdf.close()


if __name__ == "__main__":
    unittest.main()
