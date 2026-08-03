import unittest
from pathlib import Path
from types import SimpleNamespace

import fitz
from pydantic import ValidationError

from models.esign import EsignAiFieldPlacementCreateRequest, EsignAiFieldPlacementProposal
from services.esign.ai_field_placement_service import (
    DEFAULT_SIZES,
    EsignAiFieldPlacementService,
    _overlap_duplicate,
    materialize_ai_field_placement_proposal,
    parse_ai_field_placement_response,
)
from services.pdf_anchor import resolve_contextual_anchor_rect, search_pdf_anchor_text


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

    def test_response_schema_constrains_model_geometry_and_identity(self) -> None:
        schema = EsignAiFieldPlacementService._response_schema(["doc-1"], ["role-1"])
        dumped = schema.model_dump(exclude_none=True, mode="json")
        proposal = dumped["properties"]["proposals"]["items"]
        self.assertEqual(proposal["properties"]["document_id"]["enum"], ["doc-1"])
        self.assertEqual(proposal["properties"]["participant_id"]["enum"], ["role-1"])
        self.assertEqual(proposal["properties"]["width"]["minimum"], 0.001)
        self.assertEqual(proposal["properties"]["width"]["maximum"], 1.0)
        self.assertIn("match_index", proposal["properties"])

    def test_prompt_explains_repeated_anchors_and_normalized_dimensions(self) -> None:
        prompt = EsignAiFieldPlacementService._build_model_prompt(
            documents=[SimpleNamespace(id="doc-1", page_count=3)],
            participants=[{"id": "role-1", "label": "Participant"}],
            existing=[],
            page_numbered_text="Document doc-1, zero-based page 2: Signature: Date:",
            instructions=None,
        )
        self.assertIn("participant or role label as anchor_before", prompt)
        self.assertIn("following section label may be used as anchor_after", prompt)
        self.assertIn("zero-based reading-order occurrence", prompt)
        self.assertIn("normalized page ratios between 0 and 1", prompt)

    def test_invalid_optional_values_are_safely_recovered(self) -> None:
        pdf = fitz.open(); page = pdf.new_page()
        page.insert_text((72, 72), "Signature:")
        item = {
            "field_type": "signature", "anchor_text": "Signature:",
            "width": 200, "height": "large", "relative_position": "beside",
            "cross_axis_alignment": "middle", "required": "false",
            "properties": {"schema_version": 1, "multiline": True},
        }
        proposal, warnings, recovery_codes, omission_code = materialize_ai_field_placement_proposal(
            item, suggestion_number=1, document_id="doc-1", participant_id="role-1",
            page_number=0, page=page,
        )
        self.assertIsNotNone(proposal)
        self.assertIsNone(omission_code)
        self.assertEqual((proposal or {})["width"], DEFAULT_SIZES["signature"][0])
        self.assertEqual((proposal or {})["height"], DEFAULT_SIZES["signature"][1])
        self.assertEqual((proposal or {})["properties"]["schema_version"], 2)
        self.assertFalse((proposal or {})["properties"]["multiline"])
        self.assertGreaterEqual(len(warnings), 4)
        self.assertEqual(
            set(recovery_codes),
            {"default_size", "default_position", "default_alignment", "default_required", "default_properties"},
        )
        pdf.close()


class ContextualAnchorTests(unittest.TestCase):
    def test_word_filter_uses_pdf_words_instead_of_overlapping_textbox_content(self) -> None:
        pdf = fitz.open(); page = pdf.new_page()
        page.insert_text((72, 72), "Vendor legal name:")
        page.insert_text((72, 96), "No other selection")
        self.assertEqual(len(search_pdf_anchor_text(page, "Vendor legal name:", case_sensitive=True)), 1)
        self.assertEqual(len(search_pdf_anchor_text(page, "vendor legal name:", case_sensitive=True)), 0)
        self.assertEqual(len(search_pdf_anchor_text(page, "No", whole_word=True)), 1)
        pdf.close()

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

    def test_after_context_selects_the_nearest_preceding_anchor(self) -> None:
        pdf = fitz.open(); page = pdf.new_page()
        page.insert_text((72, 60), "Client")
        page.insert_text((72, 72), "Signature")
        page.insert_text((72, 132), "Partner")
        page.insert_text((72, 144), "Signature")
        rect, warning = resolve_contextual_anchor_rect(
            page, {"anchor_text": "Signature", "anchor_after": "Partner"},
        )
        self.assertIsNotNone(rect)
        self.assertIsNone(warning)
        self.assertLess((rect or fitz.Rect()).y0, 100)
        pdf.close()

    def test_match_index_selects_repeated_anchor_in_reading_order(self) -> None:
        pdf = fitz.open(); page = pdf.new_page()
        page.insert_text((72, 144), "Signature")
        page.insert_text((72, 72), "Signature")
        rect, warning = resolve_contextual_anchor_rect(
            page, {"anchor_text": "Signature", "match_index": 1},
        )
        self.assertIsNotNone(rect)
        self.assertIsNone(warning)
        self.assertGreater((rect or fitz.Rect()).y0, 100)
        pdf.close()

    def test_conflicting_context_and_match_index_is_rejected(self) -> None:
        pdf = fitz.open(); page = pdf.new_page()
        page.insert_text((72, 60), "Client")
        page.insert_text((72, 72), "Signature")
        page.insert_text((72, 132), "Partner")
        page.insert_text((72, 144), "Signature")
        rect, warning = resolve_contextual_anchor_rect(
            page,
            {"anchor_text": "Signature", "anchor_before": "Partner", "match_index": 0},
        )
        self.assertIsNone(rect)
        self.assertIn("conflicts", warning or "")
        pdf.close()


class InformedConsentRegressionTests(unittest.TestCase):
    def test_participant_fields_materialize_on_supplied_pdf(self) -> None:
        path = Path(__file__).resolve().parents[2] / "examples/e-signature/Informed_Consent.pdf"
        items = [
            {"field_type": "checkbox", "anchor_text": "Yes", "whole_word": True, "relative_position": "left"},
            {
                "field_type": "checkbox", "anchor_text": "No", "whole_word": True,
                "anchor_before": "I voluntarily agree to participate in this research program",
                "relative_position": "left",
            },
            {"field_type": "full_name", "anchor_text": "Name of Participant (print):", "relative_position": "right"},
            {
                "field_type": "signature", "anchor_text": "Signature:",
                "anchor_before": "Name of Participant (print):", "relative_position": "right",
            },
            {
                "field_type": "date_signed", "anchor_text": "Date:",
                "anchor_before": "Name of Participant (print):", "relative_position": "left",
            },
        ]
        proposals: list[dict[str, object]] = []
        with fitz.open(path) as pdf:
            page = pdf[2]
            for index, item in enumerate(items, 1):
                proposal, warnings, recovery_codes, omission_code = materialize_ai_field_placement_proposal(
                    item, suggestion_number=index, document_id="doc-1", participant_id="role-1",
                    page_number=2, page=page,
                )
                self.assertIsNotNone(proposal, warnings)
                self.assertEqual(warnings, [])
                self.assertEqual(recovery_codes, [])
                self.assertIsNone(omission_code)
                proposals.append(proposal or {})

        self.assertEqual(
            [proposal["field_type"] for proposal in proposals],
            ["checkbox", "checkbox", "full_name", "signature", "date_signed"],
        )
        for proposal in proposals:
            self.assertEqual(proposal["page_number"], 2)
            self.assertGreaterEqual(float(proposal["pos_x"]), 0)
            self.assertGreaterEqual(float(proposal["pos_y"]), 0)
            self.assertLessEqual(float(proposal["pos_x"]) + float(proposal["width"]), 1)
            self.assertLessEqual(float(proposal["pos_y"]) + float(proposal["height"]), 1)


if __name__ == "__main__":
    unittest.main()
