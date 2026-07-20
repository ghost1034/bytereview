from __future__ import annotations

import types
import uuid
from datetime import datetime, timezone

import pytest

from models.db_models import EsignEnvelopeStatus, EsignRecipientRole, EsignSigningType
from services.esign.envelope_service import EsignConflict
from services.esign.routing_engine import (
    assert_routing_version,
    available_actions,
    incomplete_blocking,
    is_eligible,
    recompute_current_routing_order,
)

NS = types.SimpleNamespace


def recipient(role, order=1, completed=False, **overrides):
    values = dict(
        id=uuid.uuid4(), role=role, routing_order=order,
        action_completed_at=datetime.now(timezone.utc) if completed else None,
        email="person@example.com", witness_for_recipient_id=None,
        allow_reassignment=False,
    )
    values.update(overrides)
    return NS(**values)


def envelope(recipients, signing_type=EsignSigningType.SEQUENTIAL, current=None):
    return NS(
        recipients=recipients, signing_type=signing_type,
        status=EsignEnvelopeStatus.IN_PROGRESS,
        current_routing_order=current, routing_version=3,
        allow_reassignment=True,
    )


def test_every_action_role_blocks_but_cc_does_not():
    blocking_roles = [role for role in EsignRecipientRole if role != EsignRecipientRole.CC]
    recipients = [recipient(role, index + 1) for index, role in enumerate(blocking_roles)]
    recipients.append(recipient(EsignRecipientRole.CC, 1))
    assert {item.role for item in incomplete_blocking(recipients)} == set(blocking_roles)


def test_equal_sequential_orders_are_parallel_within_the_step():
    first = recipient(EsignRecipientRole.APPROVER, 1)
    signer_a = recipient(EsignRecipientRole.SIGNER, 2)
    signer_b = recipient(EsignRecipientRole.SIGNER, 2)
    env = envelope([first, signer_a, signer_b])
    recompute_current_routing_order(env)
    assert is_eligible(env, first)
    assert not is_eligible(env, signer_a)
    first.action_completed_at = datetime.now(timezone.utc)
    recompute_current_routing_order(env)
    assert is_eligible(env, signer_a)
    assert is_eligible(env, signer_b)


def test_parallel_activates_all_except_dependent_witness():
    signer = recipient(EsignRecipientRole.SIGNER, 10)
    witness = recipient(
        EsignRecipientRole.WITNESS, 10,
        witness_for_recipient_id=signer.id, email=None,
    )
    approver = recipient(EsignRecipientRole.APPROVER, 99)
    env = envelope([signer, witness, approver], EsignSigningType.PARALLEL)
    recompute_current_routing_order(env)
    assert is_eligible(env, signer)
    assert is_eligible(env, approver)
    assert not is_eligible(env, witness)
    signer.action_completed_at = datetime.now(timezone.utc)
    assert is_eligible(env, witness)


def test_completion_timestamp_not_status_advances_routing():
    approved = recipient(EsignRecipientRole.APPROVER, 1, completed=True)
    approved.status = "viewed"  # deliberately inconsistent label
    delivery = recipient(EsignRecipientRole.CERTIFIED_DELIVERY, 2)
    env = envelope([approved, delivery])
    old, new = recompute_current_routing_order(env)
    assert (old, new) == (None, 2)


def test_available_actions_are_server_authorized():
    approver = recipient(EsignRecipientRole.APPROVER)
    approver.allow_reassignment = True
    env = envelope([approver], current=1)
    assert available_actions(env, approver) == ["approve", "decline", "reassign"]


def test_stale_version_conflicts():
    env = envelope([])
    assert_routing_version(env, 3)
    with pytest.raises(EsignConflict):
        assert_routing_version(env, 2)

