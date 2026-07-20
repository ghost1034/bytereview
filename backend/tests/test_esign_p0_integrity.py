"""Focused regressions for the E-Signature P0 integrity remediation."""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace as NS

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models.esign import EsignSubmitRequest
from services.esign.envelope_service import normalize_template_roles, template_field_role_id
from services.esign.scale_service import EsignScaleService


def test_legacy_template_relationship_indices_normalize_to_stable_ids() -> None:
    legacy_roles = [
        {"label": "Manager", "role": "agent", "routing_order": 1},
        {"label": "Client", "role": "signer", "routing_order": 2, "managed_by_recipient_index": 0},
        {"label": "Witness", "role": "witness", "routing_order": 2, "witness_for_recipient_index": 1},
    ]
    roles = normalize_template_roles(legacy_roles)
    assert len({role["id"] for role in roles}) == 3
    assert [role["id"] for role in roles] == [role["id"] for role in normalize_template_roles(legacy_roles)]
    assert roles[1]["managed_by_role_id"] == roles[0]["id"]
    assert roles[2]["witness_for_role_id"] == roles[1]["id"]


def test_stable_field_role_survives_role_reordering() -> None:
    signer_id, approver_id = str(uuid.uuid4()), str(uuid.uuid4())
    reordered = normalize_template_roles([
        {"id": approver_id, "label": "Review", "role": "approver"},
        {"id": signer_id, "label": "Sign", "role": "signer"},
    ])
    field = NS(recipient_role_id=uuid.UUID(signer_id), recipient_index=0)
    assert template_field_role_id(field, reordered) == signer_id


def test_common_submit_contract_accepts_witness_evidence() -> None:
    request = EsignSubmitRequest.model_validate({
        "expected_routing_version": 1,
        "signature": {"signature_type": "typed", "typed_text": "Witness Name"},
        "occupation": "CPA",
        "address": "100 Main Street",
    })
    assert request.occupation == "CPA"
    assert request.address == "100 Main Street"


def test_powerform_validates_every_visitor_before_verification() -> None:
    form = NS(
        role_config=[
            {"recipient_index": 0, "identity_source": "visitor", "initiating_signer": True},
            {"recipient_index": 1, "identity_source": "visitor", "initiating_signer": False},
        ],
        public_fields=[],
    )
    version = NS(snapshot={"recipient_roles": [{"role": "signer"}, {"role": "approver"}], "fields": []})
    try:
        EsignScaleService._validate_powerform_input(form, version, {
            "consent": True,
            "recipients": [{"recipient_index": 0, "name": "Signer", "email": "signer@example.com"}],
            "fields": {},
        })
    except ValueError as exc:
        assert "every visitor" in str(exc).lower()
    else:
        raise AssertionError("missing visitor identity was accepted")
