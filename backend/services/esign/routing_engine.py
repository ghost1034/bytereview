"""Shared routing invariants for every e-sign recipient role.

Ceremonies set ``action_completed_at``; this module alone decides which
blocking routing order is active.  Keeping status labels out of the routing
decision makes new roles safe to add and preserves mixed sequential/parallel
groups.
"""

from __future__ import annotations

from typing import Iterable

from models.db_models import EsignRecipientRole, EsignSigningType
from services.esign.envelope_service import EsignConflict


BLOCKING_ROLES = {
    EsignRecipientRole.SIGNER,
    EsignRecipientRole.APPROVER,
    EsignRecipientRole.CERTIFIED_DELIVERY,
    EsignRecipientRole.AGENT,
    EsignRecipientRole.EDITOR,
    EsignRecipientRole.WITNESS,
    EsignRecipientRole.IN_PERSON_SIGNER,
}
SIGNATURE_ROLES = {
    EsignRecipientRole.SIGNER,
    EsignRecipientRole.WITNESS,
    EsignRecipientRole.IN_PERSON_SIGNER,
}
MANAGER_ROLES = {EsignRecipientRole.AGENT, EsignRecipientRole.EDITOR}


def role_value(recipient) -> EsignRecipientRole:
    return recipient.role if isinstance(recipient.role, EsignRecipientRole) else EsignRecipientRole(str(recipient.role))


def is_blocking(recipient) -> bool:
    return role_value(recipient) in BLOCKING_ROLES


def is_complete(recipient) -> bool:
    if not is_blocking(recipient):
        return True
    marker = getattr(recipient, "action_completed_at", ...)
    if marker is not ...:
        return marker is not None
    # Compatibility for pre-migration unit doubles only; persisted recipients
    # always have action_completed_at and routing never consults their status.
    status = getattr(recipient, "status", None)
    value = status.value if hasattr(status, "value") else str(status)
    return value in {"signed", "approved", "delivered", "managed", "declined"}


def incomplete_blocking(recipients: Iterable) -> list:
    return [recipient for recipient in recipients if is_blocking(recipient) and not is_complete(recipient)]


def recompute_current_routing_order(envelope) -> tuple[int | None, int | None]:
    """Set and return ``(old, new)`` using the minimum incomplete blocking order."""
    old = envelope.current_routing_order
    pending = incomplete_blocking(envelope.recipients or [])
    new = min((int(recipient.routing_order) for recipient in pending), default=None)
    envelope.current_routing_order = new
    return old, new


def witness_dependency_complete(recipient, recipients: Iterable) -> bool:
    dependency_id = getattr(recipient, "witness_for_recipient_id", None)
    if role_value(recipient) != EsignRecipientRole.WITNESS or dependency_id is None:
        return True
    dependency = next((item for item in recipients if str(item.id) == str(dependency_id)), None)
    return dependency is not None and dependency.action_completed_at is not None


def is_eligible(envelope, recipient) -> bool:
    if not is_blocking(recipient) or is_complete(recipient):
        return False
    if getattr(recipient, "email", None) is None and role_value(recipient) not in (
        EsignRecipientRole.WITNESS, EsignRecipientRole.IN_PERSON_SIGNER,
    ):
        return False
    if not witness_dependency_complete(recipient, envelope.recipients or []):
        return False
    signing_type = envelope.signing_type
    if not isinstance(signing_type, EsignSigningType):
        signing_type = EsignSigningType(str(signing_type))
    if signing_type == EsignSigningType.PARALLEL:
        return True
    return envelope.current_routing_order is not None and int(recipient.routing_order) == int(envelope.current_routing_order)


def assert_routing_version(envelope, expected: int) -> None:
    actual = int(getattr(envelope, "routing_version", 1) or 1)
    if int(expected) != actual:
        raise EsignConflict(
            f"Routing changed while this page was open (expected version {expected}, current version {actual})"
        )


def available_actions(envelope, recipient) -> list[str]:
    if not is_eligible(envelope, recipient):
        return []
    role = role_value(recipient)
    actions: list[str]
    if role == EsignRecipientRole.SIGNER:
        actions = ["consent", "sign", "decline"]
        if any(str(getattr(item, "witness_for_recipient_id", "")) == str(recipient.id) for item in envelope.recipients or []):
            actions.append("configure_witness")
    elif role == EsignRecipientRole.APPROVER:
        actions = ["approve", "decline"]
    elif role == EsignRecipientRole.CERTIFIED_DELIVERY:
        actions = ["view"]
    elif role == EsignRecipientRole.AGENT:
        actions = ["manage_recipients", "manager_complete", "decline"]
    elif role == EsignRecipientRole.EDITOR:
        actions = ["manage_recipients", "correct_recipients", "manager_complete", "decline"]
    elif role == EsignRecipientRole.WITNESS:
        actions = ["guest_consent", "guest_sign"]
    elif role == EsignRecipientRole.IN_PERSON_SIGNER:
        actions = ["start_handoff"]
    else:
        actions = []
    if (
        role not in (EsignRecipientRole.CC, EsignRecipientRole.WITNESS, EsignRecipientRole.IN_PERSON_SIGNER)
        and getattr(envelope, "allow_reassignment", False)
        and getattr(recipient, "allow_reassignment", False)
    ):
        actions.append("reassign")
    return actions
