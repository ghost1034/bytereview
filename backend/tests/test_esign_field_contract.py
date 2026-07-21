import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.esign import EsignFieldInput, EsignSubmitRequest


VALID_PROPERTIES = {
    "signature": {}, "initials": {}, "stamp": {}, "date_signed": {},
    "text": {"multiline": True, "text_validation": {"regex": "[A-Z]+", "message": "Use capitals"}},
    "checkbox": {"selection_group": {"id": "g", "label": "Choose", "minimum_selected": 1, "maximum_selected": 2}},
    "auto_fill": {"auto_source": "recipient_email"},
    "attachment": {"allowed_types": ["application/pdf"]},
    "radio": {"group": {"id": "g", "label": "Choose one"}, "option_value": "a"},
    "dropdown": {"options": [{"value": "stable-a", "label": "A"}], "sender_prefill": "stable-a"},
    "formula": {"formula": {"expression": "1 + 1", "decimal_places": 0}},
    "date": {"date_validation": {"minimum": "2026-01-01"}},
    "number": {"number_validation": {"minimum": -10, "decimal_places": 2}},
    "first_name": {}, "last_name": {}, "full_name": {}, "email": {},
    "company": {"text_validation": {"max_length": 100}},
    "title": {"sender_prefill": "Controller"},
    "note": {"sender_prefill": "Read this note"},
}


def field(field_type: str, properties: dict) -> EsignFieldInput:
    return EsignFieldInput.model_validate({
        "document_id": "doc", "recipient_id": "recipient", "field_type": field_type,
        "page_number": 0, "pos_x": 0.1, "pos_y": 0.1, "width": 0.2, "height": 0.05,
        "properties": properties,
    })


@pytest.mark.parametrize("field_type,properties", VALID_PROPERTIES.items())
def test_all_twenty_types_have_versioned_allowed_contract(field_type, properties):
    result = field(field_type, properties)
    assert result.properties.schema_version == 2
    if field_type == "formula":
        assert result.required is False


@pytest.mark.parametrize(
    "field_type",
    [
        "date_signed", "text", "auto_fill", "dropdown", "formula", "date", "number",
        "first_name", "last_name", "full_name", "email", "company", "title", "note",
    ],
)
def test_all_text_rendering_fields_accept_font_size_and_alignment(field_type):
    result = field(
        field_type,
        {
            **VALID_PROPERTIES[field_type],
            "appearance": {"font": "Times", "font_size": 12, "alignment": "right"},
        },
    )
    assert result.properties.appearance.font == "Times"
    assert result.properties.appearance.font_size == 12
    assert result.properties.appearance.alignment == "right"


@pytest.mark.parametrize(
    "field_type,properties",
    [
        ("signature", {"shared_value": True}),
        ("attachment", {"read_only": True, "allowed_types": ["application/pdf"]}),
        ("date_signed", {"sender_prefill": "2026-07-20"}),
        ("text", {"options": [{"value": "a", "label": "A"}]}),
        ("checkbox", {"formula": {"expression": "1"}}),
    ],
)
def test_unsupported_properties_are_rejected_at_api_boundary(field_type, properties):
    with pytest.raises(ValidationError, match="do not support"):
        field(field_type, properties)


def test_defaults_and_selection_groups_are_validated():
    with pytest.raises(ValidationError, match="sender_prefill"):
        field("dropdown", {"options": [{"value": "a", "label": "A"}], "sender_prefill": "missing"})
    with pytest.raises(ValidationError, match="minimum_selected"):
        field("checkbox", {"selection_group": {"id": "g", "label": "G", "minimum_selected": 2, "maximum_selected": 1}})


def test_submit_can_be_text_only_without_adopting_a_signature():
    request = EsignSubmitRequest.model_validate({
        "expected_routing_version": 1,
        "field_values": [{"field_id": "text", "value": "complete"}],
    })
    assert request.signature is None
    assert request.marks is None


def test_schema_rejects_unknown_field_types():
    with pytest.raises(ValidationError):
        field("unsupported", {})
