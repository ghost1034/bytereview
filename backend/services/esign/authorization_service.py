"""Single firm-scoped authorization resolver for sender-side E-Signature actions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal
import uuid

from sqlalchemy.orm import Session

from models.db_models import (
    AnalyticsUserRole,
    EsignEnvelope,
    EsignEnvelopeGrant,
    EsignFirmSettings,
    EsignPermissionAssignment,
    EsignPermissionProfile,
    User,
)


DEFAULT_FEATURES = {
    "ai_field_placement": True,
    "scheduled_sending": True,
    "bulk_sends": True,
    "powerforms": True,
    "advanced_recipients": True,
    "recipient_reassignment": True,
    "signer_attachments": True,
    "envelope_webhooks": True, "exports": True,
}

SENDER_CAPABILITIES = {
    "send": True, "templates": True, "scheduling": True, "bulk_sends": True,
    "powerforms": True, "advanced_recipients": True, "corrections": True,
    "voiding": True, "reminders": True, "sharing": True, "reports": True,
    "envelope_webhooks": True, "exports": True,
}


@dataclass(frozen=True)
class EsignPrincipal:
    user_id: str
    firm_id: uuid.UUID
    is_admin: bool
    profile_id: uuid.UUID | None
    profile_name: str
    capabilities: dict[str, bool]
    features: dict[str, bool]

    def can(self, capability: str) -> bool:
        return self.is_admin or bool(self.capabilities.get(capability))


@dataclass(frozen=True)
class EnvelopeAccess:
    envelope: EsignEnvelope
    level: Literal["owner", "manage", "view", "admin"]

    @property
    def can_manage(self) -> bool:
        return self.level in ("owner", "manage", "admin")

    @property
    def can_control_access(self) -> bool:
        return self.level in ("owner", "admin")


class EsignAuthorizationService:
    def principal(self, db: Session, user_id: str) -> EsignPrincipal | None:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None or user.firm_id is None:
            return None
        is_admin = user.role == AnalyticsUserRole.ADMIN or getattr(user.role, "value", user.role) == "admin"
        assignment = (
            db.query(EsignPermissionAssignment, EsignPermissionProfile)
            .join(EsignPermissionProfile, EsignPermissionProfile.id == EsignPermissionAssignment.profile_id)
            .filter(
                EsignPermissionAssignment.firm_id == user.firm_id,
                EsignPermissionAssignment.user_id == user_id,
                EsignPermissionProfile.firm_id == user.firm_id,
            )
            .first()
        )
        profile = assignment[1] if assignment else None
        settings = db.query(EsignFirmSettings).filter(EsignFirmSettings.firm_id == user.firm_id).first()
        return EsignPrincipal(
            user_id=user_id,
            firm_id=user.firm_id,
            is_admin=is_admin,
            profile_id=profile.id if profile else None,
            profile_name=profile.name if profile else ("Firm administrator" if is_admin else "Sender"),
            capabilities=dict(profile.capabilities or {}) if profile else ({} if is_admin else dict(SENDER_CAPABILITIES)),
            features={**DEFAULT_FEATURES, **(dict(settings.features or {}) if settings else {})},
        )

    def envelope_access(
        self, db: Session, user_id: str, envelope: EsignEnvelope, *, require_manage: bool = False,
        owner_only: bool = False, capability: str | None = None,
    ) -> EnvelopeAccess | None:
        principal = self.principal(db, user_id)
        # Legacy/unit-test compatibility: an owner remains an owner even before
        # its firm administration backfill has run.
        if envelope.user_id == user_id:
            access = EnvelopeAccess(envelope, "owner")
        elif principal is None or envelope.firm_id != principal.firm_id:
            return None
        elif principal.is_admin:
            access = EnvelopeAccess(envelope, "admin")
        else:
            grant = db.query(EsignEnvelopeGrant).filter(
                EsignEnvelopeGrant.envelope_id == envelope.id,
                EsignEnvelopeGrant.firm_id == principal.firm_id,
                EsignEnvelopeGrant.user_id == user_id,
            ).first()
            if grant:
                access = EnvelopeAccess(envelope, "manage" if grant.access_level == "manage" else "view")
            elif principal.can("firm_manage"):
                access = EnvelopeAccess(envelope, "manage")
            elif principal.can("firm_view"):
                access = EnvelopeAccess(envelope, "view")
            else:
                return None
        if owner_only and not access.can_control_access:
            return None
        if require_manage and not access.can_manage:
            return None
        if capability and principal is not None and not principal.can(capability):
            return None
        return access

    @staticmethod
    def effective_feature(principal: EsignPrincipal, feature: str, capability: str | None = None) -> bool:
        return bool(principal.features.get(feature)) and (not capability or principal.can(capability))

    def can_manage_firm_resource(self, db: Session, user_id: str, firm_id, owner_user_id: str) -> bool:
        if owner_user_id == user_id:
            return True
        principal = self.principal(db, user_id)
        return bool(principal and principal.firm_id == firm_id and (principal.is_admin or principal.can("firm_manage")))


esign_authorization_service = EsignAuthorizationService()
