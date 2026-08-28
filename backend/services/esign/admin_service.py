"""Firm E-Signature administration and custody operations."""

from __future__ import annotations

import hashlib
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from core.database import db_config
from models.db_models import (
    AnalyticsUserRole, EsignAdminEvent, EsignBrandAsset, EsignBrandProfile,
    EsignBulkJob, EsignEnvelope, EsignEnvelopeGrant, EsignEnvelopeStatus, EsignEvent,
    EsignEventType, EsignFirmSettings, EsignPermissionAssignment,
    EsignPermissionProfile, EsignPowerForm, EsignTemplate,
    EsignWebhookAttempt, EsignWebhookConfiguration, EsignWebhookDelivery, User,
)
from models.esign import (
    EsignBrandProfileRequest, EsignPermissionProfileRequest,
    EsignSettingsUpdateRequest, EsignWebhookConfigurationRequest, EsignCustodyRemediationRequest,
)
from services.esign import audit_service
from services.analytics.firm_scope import ensure_user_row, get_or_create_user_firm
from services.esign.authorization_service import DEFAULT_FEATURES, SENDER_CAPABILITIES, esign_authorization_service
from services.esign.envelope_service import EsignConflict, EsignError, EsignNotFound
from services.esign.webhook_service import build_event_payload, generate_webhook_secret, validate_webhook_destination
from services.gcs_service import get_storage_service


BUILT_INS = {
    "sender": ("Sender", SENDER_CAPABILITIES),
    "firm_operator": ("Firm Operator", {**SENDER_CAPABILITIES, "manage_shared_envelopes": True, "firm_view": True,
                                         "firm_manage": True, "custody_transfer": True, "exports": True}),
    "read_only_auditor": ("Read-only Auditor", {"firm_view": True, "reports": True, "exports": True}),
    "restricted": ("Restricted", {}),
}
KNOWN_CAPABILITIES = set().union(*(caps.keys() for _, caps in BUILT_INS.values()))
KNOWN_FEATURES = set(DEFAULT_FEATURES)
COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _serialize_profile(profile: EsignPermissionProfile) -> dict[str, Any]:
    return {"id": str(profile.id), "name": profile.name, "capabilities": dict(profile.capabilities or {}),
            "built_in_key": profile.built_in_key, "locked": bool(profile.locked),
            "created_at": profile.created_at, "updated_at": profile.updated_at}


def _serialize_brand(brand: EsignBrandProfile) -> dict[str, Any]:
    return {"id": str(brand.id), "name": brand.name, "logo_asset_id": str(brand.logo_asset_id) if brand.logo_asset_id else None,
            "primary_color": brand.primary_color, "accent_color": brand.accent_color,
            "email_header": brand.email_header, "email_footer": brand.email_footer,
            "reply_to_address": brand.reply_to_address, "signing_welcome_text": brand.signing_welcome_text,
            "support_url": brand.support_url, "active": bool(brand.active),
            "allowed_profile_ids": [str(item) for item in (brand.allowed_profile_ids or [])],
            "created_at": brand.created_at, "updated_at": brand.updated_at}


class EsignAdminService:
    def __init__(self) -> None:
        self.storage = get_storage_service()

    def _get_session(self) -> Session:
        return db_config.get_session()

    @staticmethod
    def _actor(db: Session, user_id: str, *, admin: bool = False) -> User:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None or user.firm_id is None:
            raise EsignNotFound("E-Signature firm not found")
        if admin and getattr(user.role, "value", user.role) != AnalyticsUserRole.ADMIN.value:
            raise EsignNotFound("E-Signature administration not found")
        return user

    @staticmethod
    def _audit(db: Session, actor: User, event_type: str, target_type: str | None = None,
               target_id: str | None = None, details: dict[str, Any] | None = None) -> None:
        db.add(EsignAdminEvent(id=uuid.uuid4(), firm_id=actor.firm_id, actor_user_id=actor.id,
                               actor_email=actor.email.lower(), event_type=event_type,
                               target_type=target_type, target_id=target_id, details=details))
        db.flush()

    def _ensure_defaults(self, db: Session, firm_id) -> tuple[EsignFirmSettings, list[EsignPermissionProfile]]:
        settings = db.query(EsignFirmSettings).filter(EsignFirmSettings.firm_id == firm_id).first()
        if settings is None:
            settings = EsignFirmSettings(firm_id=firm_id, features=dict(DEFAULT_FEATURES), sender_overrides={})
            db.add(settings)
        profiles = db.query(EsignPermissionProfile).filter(EsignPermissionProfile.firm_id == firm_id).all()
        by_key = {profile.built_in_key: profile for profile in profiles}
        for key, (name, capabilities) in BUILT_INS.items():
            if key not in by_key:
                profile = EsignPermissionProfile(id=uuid.uuid4(), firm_id=firm_id, name=name,
                                                 capabilities=dict(capabilities), built_in_key=key, locked=True)
                db.add(profile)
                profiles.append(profile)
            else:
                # Built-ins are product policy, not user-editable profiles. Keep
                # existing firms aligned when capabilities are added in releases.
                by_key[key].name = name
                by_key[key].capabilities = dict(capabilities)
        db.flush()
        sender = next(profile for profile in profiles if profile.built_in_key == "sender")
        assigned_ids = db.query(EsignPermissionAssignment.user_id).filter(EsignPermissionAssignment.firm_id == firm_id)
        unassigned = db.query(User).filter(User.firm_id == firm_id, User.role != AnalyticsUserRole.ADMIN,
                                           ~User.id.in_(assigned_ids)).all()
        for user in unassigned:
            db.add(EsignPermissionAssignment(firm_id=firm_id, user_id=user.id, profile_id=sender.id))
        db.flush()
        return settings, profiles

    def context(
        self,
        user_id: str,
        *,
        user_email: str,
        display_name: str | None = None,
        photo_url: str | None = None,
    ) -> dict[str, Any]:
        db = self._get_session()
        try:
            user = ensure_user_row(
                db,
                user_id=user_id,
                email=user_email,
                display_name=display_name,
                photo_url=photo_url,
            )
            actor, firm = get_or_create_user_firm(db, user.id)
            self._ensure_defaults(db, actor.firm_id)
            db.commit()
            principal = esign_authorization_service.principal(db, user_id)
            assert principal is not None
            return {
                "firm": {"id": str(actor.firm_id), "name": firm.name},
                "profile": {"id": str(principal.profile_id) if principal.profile_id else None,
                            "name": principal.profile_name, "capabilities": principal.capabilities,
                            "admin_override": principal.is_admin},
                "features": principal.features,
                "administrative_capabilities": {
                    "manage_settings": principal.is_admin, "manage_brands": principal.is_admin,
                    "manage_permissions": principal.is_admin, "manage_firm_webhooks": principal.is_admin,
                    "view_firm_envelopes": principal.is_admin or principal.can("firm_view"),
                    "manage_firm_envelopes": principal.is_admin or principal.can("firm_manage"),
                    "transfer_custody": principal.is_admin or principal.can("custody_transfer"),
                },
            }
        finally:
            db.close()

    def overview(self, user_id: str) -> dict[str, Any]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True)
            now = datetime.now(timezone.utc)
            envelope_query = db.query(EsignEnvelope).filter(EsignEnvelope.firm_id == actor.firm_id)
            ownership_issues = envelope_query.outerjoin(User, User.id == EsignEnvelope.user_id).filter(
                or_(User.id.is_(None), User.firm_id != actor.firm_id)
            ).count()
            return {
                "envelopes": envelope_query.count(),
                "users": db.query(User).filter(User.firm_id == actor.firm_id).count(),
                "send_failures": envelope_query.filter(EsignEnvelope.status == EsignEnvelopeStatus.SEND_FAILED).count(),
                "expiring_envelopes": envelope_query.filter(EsignEnvelope.expires_at.between(now, now + timedelta(days=7))).count(),
                "webhook_failures": db.query(EsignWebhookDelivery).filter(
                    EsignWebhookDelivery.firm_id == actor.firm_id,
                    EsignWebhookDelivery.status.in_(("retry", "terminal"))).count(),
                "custody_issues": ownership_issues,
            }
        finally:
            db.close()

    def custody_review(self, user_id: str) -> list[dict[str, Any]]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True); rows: list[dict[str, Any]] = []
            for kind, model in (("envelope", EsignEnvelope), ("template", EsignTemplate),
                                ("bulk_job", EsignBulkJob), ("powerform", EsignPowerForm)):
                assets = db.query(model).outerjoin(User, User.id == model.user_id).filter(
                    model.firm_id == actor.firm_id, or_(User.id.is_(None), User.firm_id != actor.firm_id)).all()
                rows.extend({"asset_type": kind, "asset_id": str(asset.id), "recorded_owner_id": asset.user_id,
                             "created_at": getattr(asset, "created_at", None)} for asset in assets)
            return sorted(rows, key=lambda item: str(item.get("created_at") or ""), reverse=True)
        finally: db.close()

    def remediate_custody(self, user_id: str, payload: EsignCustodyRemediationRequest) -> dict[str, Any]:
        models = {"envelope": EsignEnvelope, "template": EsignTemplate,
                  "bulk_job": EsignBulkJob, "powerform": EsignPowerForm}
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True); model = models[payload.asset_type]
            asset = db.query(model).filter(model.id == uuid.UUID(payload.asset_id), model.firm_id == actor.firm_id).first()
            successor = db.query(User).filter(User.id == payload.successor_user_id, User.firm_id == actor.firm_id).first()
            if not asset or not successor: raise EsignNotFound("Custody asset or successor not found")
            previous_owner = asset.user_id; asset.user_id = successor.id
            self._audit(db, actor, "custody.remediated", payload.asset_type, str(asset.id),
                        {"previous_owner_id": previous_owner, "successor_user_id": successor.id})
            db.commit(); return {"asset_type": payload.asset_type, "asset_id": str(asset.id), "owner_id": successor.id}
        except Exception: db.rollback(); raise
        finally: db.close()

    def get_settings(self, user_id: str) -> dict[str, Any]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True)
            settings, _ = self._ensure_defaults(db, actor.firm_id)
            db.commit(); db.refresh(settings)
            return self._settings_dict(settings)
        finally: db.close()

    @staticmethod
    def _settings_dict(settings: EsignFirmSettings) -> dict[str, Any]:
        return {"version": settings.version, "default_brand_id": str(settings.default_brand_id) if settings.default_brand_id else None,
                "date_format": settings.date_format, "signing_type": settings.signing_type,
                "expiration_days": settings.expiration_days, "reminder_interval_hours": settings.reminder_interval_hours,
                "allow_reassignment": settings.allow_reassignment, "sender_overrides": dict(settings.sender_overrides or {}),
                "features": {**DEFAULT_FEATURES, **dict(settings.features or {})}, "updated_at": settings.updated_at}

    def update_settings(self, user_id: str, payload: EsignSettingsUpdateRequest) -> dict[str, Any]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True); settings, _ = self._ensure_defaults(db, actor.firm_id)
            changes = payload.model_dump(exclude_unset=True)
            if "features" in changes and any(key not in KNOWN_FEATURES for key in changes["features"]):
                raise EsignError("Unknown E-Signature feature")
            if "sender_overrides" in changes and any(key not in {"brand", "date_format", "signing_type", "expiration", "reminders", "reassignment"} for key in changes["sender_overrides"]):
                raise EsignError("Unknown sender override")
            if changes.get("default_brand_id"):
                brand = db.query(EsignBrandProfile).filter(EsignBrandProfile.id == uuid.UUID(changes["default_brand_id"]),
                                                          EsignBrandProfile.firm_id == actor.firm_id).first()
                if brand is None: raise EsignNotFound("Brand not found")
                changes["default_brand_id"] = brand.id
            for key, value in changes.items():
                if key == "features": value = {**dict(settings.features or {}), **value}
                if key == "sender_overrides": value = {**dict(settings.sender_overrides or {}), **value}
                setattr(settings, key, value)
            settings.version += 1; settings.updated_by_user_id = actor.id
            self._audit(db, actor, "settings.updated", "settings", str(actor.firm_id), {"fields": sorted(changes)})
            db.commit(); db.refresh(settings)
            return self._settings_dict(settings)
        except Exception: db.rollback(); raise
        finally: db.close()

    def list_profiles(self, user_id: str) -> list[dict[str, Any]]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True); _, profiles = self._ensure_defaults(db, actor.firm_id); db.commit()
            return [_serialize_profile(item) for item in sorted(profiles, key=lambda row: row.name.lower())]
        finally: db.close()

    def create_profile(self, user_id: str, payload: EsignPermissionProfileRequest) -> dict[str, Any]:
        if any(key not in KNOWN_CAPABILITIES for key in payload.capabilities): raise EsignError("Unknown E-Signature capability")
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True)
            profile = EsignPermissionProfile(id=uuid.uuid4(), firm_id=actor.firm_id, name=payload.name.strip(),
                                             capabilities=dict(payload.capabilities), locked=False, created_by_user_id=actor.id)
            db.add(profile); self._audit(db, actor, "permission_profile.created", "permission_profile", str(profile.id))
            db.commit(); db.refresh(profile); return _serialize_profile(profile)
        except Exception: db.rollback(); raise
        finally: db.close()

    def update_profile(self, user_id: str, profile_id: str, payload: EsignPermissionProfileRequest) -> dict[str, Any]:
        if any(key not in KNOWN_CAPABILITIES for key in payload.capabilities): raise EsignError("Unknown E-Signature capability")
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True)
            profile = db.query(EsignPermissionProfile).filter(EsignPermissionProfile.id == uuid.UUID(profile_id), EsignPermissionProfile.firm_id == actor.firm_id).first()
            if not profile: raise EsignNotFound("Permission profile not found")
            if profile.locked: raise EsignConflict("Built-in permission profiles are locked; clone one to customize it")
            profile.name, profile.capabilities = payload.name.strip(), dict(payload.capabilities)
            self._audit(db, actor, "permission_profile.updated", "permission_profile", str(profile.id))
            db.commit(); db.refresh(profile); return _serialize_profile(profile)
        except Exception: db.rollback(); raise
        finally: db.close()

    def assign_profile(self, user_id: str, target_user_id: str, profile_id: str) -> dict[str, Any]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True)
            target = db.query(User).filter(User.id == target_user_id, User.firm_id == actor.firm_id).first()
            profile = db.query(EsignPermissionProfile).filter(EsignPermissionProfile.id == uuid.UUID(profile_id), EsignPermissionProfile.firm_id == actor.firm_id).first()
            if not target or not profile: raise EsignNotFound("Firm user or permission profile not found")
            assignment = db.query(EsignPermissionAssignment).filter(EsignPermissionAssignment.firm_id == actor.firm_id,
                                                                    EsignPermissionAssignment.user_id == target.id).first()
            if assignment: assignment.profile_id, assignment.assigned_by_user_id = profile.id, actor.id
            else: db.add(EsignPermissionAssignment(firm_id=actor.firm_id, user_id=target.id, profile_id=profile.id, assigned_by_user_id=actor.id))
            self._audit(db, actor, "permission_profile.assigned", "user", target.id, {"profile_id": str(profile.id)})
            db.commit(); return {"user_id": target.id, "profile": _serialize_profile(profile)}
        except Exception: db.rollback(); raise
        finally: db.close()

    @staticmethod
    def _contrast_ratio(color: str) -> float:
        rgb = [int(color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
        channels = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in rgb]
        lum = .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2]
        return (1.05 / (lum + .05))  # white foreground

    def create_brand(self, user_id: str, payload: EsignBrandProfileRequest) -> dict[str, Any]:
        if not COLOR_RE.match(payload.primary_color) or not COLOR_RE.match(payload.accent_color): raise EsignError("Brand colors must use #RRGGBB")
        if self._contrast_ratio(payload.primary_color) < 4.5 or self._contrast_ratio(payload.accent_color) < 4.5:
            raise EsignError("Brand colors must have accessible contrast with white text")
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True)
            values = payload.model_dump(); values["reply_to_address"] = str(values["reply_to_address"]) if values.get("reply_to_address") else None
            if values.get("logo_asset_id"):
                asset = db.query(EsignBrandAsset).filter(EsignBrandAsset.id == uuid.UUID(values["logo_asset_id"]), EsignBrandAsset.firm_id == actor.firm_id).first()
                if not asset: raise EsignNotFound("Brand asset not found")
                values["logo_asset_id"] = asset.id
            values["allowed_profile_ids"] = [uuid.UUID(item) for item in values.get("allowed_profile_ids") or []] or None
            brand = EsignBrandProfile(id=uuid.uuid4(), firm_id=actor.firm_id, created_by_user_id=actor.id, **values)
            db.add(brand); self._audit(db, actor, "brand.created", "brand", str(brand.id)); db.commit(); db.refresh(brand)
            return _serialize_brand(brand)
        except Exception: db.rollback(); raise
        finally: db.close()

    def list_brands(self, user_id: str) -> list[dict[str, Any]]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True)
            return [_serialize_brand(item) for item in db.query(EsignBrandProfile).filter(EsignBrandProfile.firm_id == actor.firm_id).order_by(EsignBrandProfile.name).all()]
        finally: db.close()

    def update_brand(self, user_id: str, brand_id: str, payload: EsignBrandProfileRequest) -> dict[str, Any]:
        if not COLOR_RE.match(payload.primary_color) or not COLOR_RE.match(payload.accent_color): raise EsignError("Brand colors must use #RRGGBB")
        if self._contrast_ratio(payload.primary_color) < 4.5 or self._contrast_ratio(payload.accent_color) < 4.5:
            raise EsignError("Brand colors must have accessible contrast with white text")
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True); brand = db.query(EsignBrandProfile).filter(
                EsignBrandProfile.id == uuid.UUID(brand_id), EsignBrandProfile.firm_id == actor.firm_id).first()
            if not brand: raise EsignNotFound("Brand not found")
            values = payload.model_dump(); values["reply_to_address"] = str(values["reply_to_address"]) if values.get("reply_to_address") else None
            if values.get("logo_asset_id"):
                asset = db.query(EsignBrandAsset).filter(EsignBrandAsset.id == uuid.UUID(values["logo_asset_id"]), EsignBrandAsset.firm_id == actor.firm_id).first()
                if not asset: raise EsignNotFound("Brand asset not found")
                values["logo_asset_id"] = asset.id
            else: values["logo_asset_id"] = None
            values["allowed_profile_ids"] = [uuid.UUID(item) for item in values.get("allowed_profile_ids") or []] or None
            for key, value in values.items(): setattr(brand, key, value)
            self._audit(db, actor, "brand.updated", "brand", str(brand.id)); db.commit(); db.refresh(brand)
            return _serialize_brand(brand)
        except Exception: db.rollback(); raise
        finally: db.close()

    async def upload_brand_asset(self, user_id: str, filename: str, content_type: str, content: bytes) -> dict[str, Any]:
        if content_type not in ("image/png", "image/jpeg") or len(content) > 2 * 1024 * 1024 or not content:
            raise EsignError("Logo must be a PNG or JPEG no larger than 2 MB")
        signature_ok = content.startswith(b"\x89PNG\r\n\x1a\n") if content_type == "image/png" else content.startswith(b"\xff\xd8\xff")
        if not signature_ok: raise EsignError("Logo content does not match its declared image type")
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True); asset_id = uuid.uuid4()
            extension = "png" if content_type == "image/png" else "jpg"
            object_name = f"esign_brand_assets/{actor.firm_id}/{asset_id}.{extension}"
            await self.storage.upload_file_content(content, object_name)
            asset = EsignBrandAsset(id=asset_id, firm_id=actor.firm_id, gcs_object_name=object_name,
                                    content_type=content_type, sha256=hashlib.sha256(content).hexdigest(),
                                    file_size_bytes=len(content), created_by_user_id=actor.id)
            db.add(asset); self._audit(db, actor, "brand_asset.created", "brand_asset", str(asset.id)); db.commit()
            return {"id": str(asset.id), "content_type": content_type, "sha256": asset.sha256, "file_size_bytes": len(content)}
        except Exception: db.rollback(); raise
        finally: db.close()

    def list_access(self, user_id: str, envelope_id: str) -> dict[str, Any]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id); envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == uuid.UUID(envelope_id)).first()
            if not envelope or not esign_authorization_service.envelope_access(db, actor.id, envelope, require_manage=False): raise EsignNotFound("Envelope not found")
            grants = db.query(EsignEnvelopeGrant, User).join(User, User.id == EsignEnvelopeGrant.user_id).filter(EsignEnvelopeGrant.envelope_id == envelope.id).all()
            return {"owner_id": envelope.user_id, "grants": [{"user_id": user.id, "email": user.email, "name": user.display_name,
                                                                "access_level": grant.access_level, "created_at": grant.created_at} for grant, user in grants]}
        finally: db.close()

    def grant_access(self, user_id: str, user_email: str, envelope_id: str, target_user_id: str, access_level: str) -> dict[str, Any]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id); envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == uuid.UUID(envelope_id)).first()
            if not envelope or not esign_authorization_service.envelope_access(db, actor.id, envelope, owner_only=True): raise EsignNotFound("Envelope not found")
            principal = esign_authorization_service.principal(db, actor.id)
            if principal and not principal.can("sharing"): raise EsignNotFound("Envelope not found")
            target = db.query(User).filter(User.id == target_user_id, User.firm_id == envelope.firm_id).first()
            if not target or target.id == envelope.user_id: raise EsignNotFound("Firm user not found")
            grant = db.query(EsignEnvelopeGrant).filter(EsignEnvelopeGrant.envelope_id == envelope.id, EsignEnvelopeGrant.user_id == target.id).first()
            if grant: grant.access_level, grant.granted_by_user_id = access_level, actor.id
            else:
                grant = EsignEnvelopeGrant(id=uuid.uuid4(), envelope_id=envelope.id, firm_id=envelope.firm_id,
                                           user_id=target.id, access_level=access_level, granted_by_user_id=actor.id); db.add(grant)
            audit_service.record_event(db, envelope_id=envelope.id, event_type=EsignEventType.ACCESS_GRANTED,
                                       actor_user_id=actor.id, actor_email=user_email,
                                       details={"user_id": target.id, "access_level": access_level})
            self._audit(db, actor, "envelope.access_granted", "envelope", str(envelope.id), {"user_id": target.id, "access_level": access_level})
            db.commit(); return {"user_id": target.id, "access_level": access_level}
        except Exception: db.rollback(); raise
        finally: db.close()

    def revoke_access(self, user_id: str, user_email: str, envelope_id: str, target_user_id: str) -> None:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id); envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == uuid.UUID(envelope_id)).first()
            if not envelope or not esign_authorization_service.envelope_access(db, actor.id, envelope, owner_only=True): raise EsignNotFound("Envelope not found")
            grant = db.query(EsignEnvelopeGrant).filter(EsignEnvelopeGrant.envelope_id == envelope.id, EsignEnvelopeGrant.user_id == target_user_id).first()
            if not grant: raise EsignNotFound("Envelope access grant not found")
            db.delete(grant)
            audit_service.record_event(db, envelope_id=envelope.id, event_type=EsignEventType.ACCESS_REVOKED,
                                       actor_user_id=actor.id, actor_email=user_email, details={"user_id": target_user_id})
            self._audit(db, actor, "envelope.access_revoked", "envelope", str(envelope.id), {"user_id": target_user_id}); db.commit()
        except Exception: db.rollback(); raise
        finally: db.close()

    def transfer(self, user_id: str, user_email: str, envelope_id: str, successor_id: str, retain_view: bool) -> dict[str, Any]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id); envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == uuid.UUID(envelope_id)).first()
            if not envelope or not esign_authorization_service.envelope_access(db, actor.id, envelope, owner_only=True): raise EsignNotFound("Envelope not found")
            successor = db.query(User).filter(User.id == successor_id, User.firm_id == envelope.firm_id).first()
            if not successor or successor.id == envelope.user_id: raise EsignError("Choose another user in this firm")
            previous_owner = envelope.user_id
            previous_member = db.query(User).filter(User.id == previous_owner, User.firm_id == envelope.firm_id).first()
            retain_view = bool(retain_view and previous_member)
            envelope.user_id = successor.id
            db.query(EsignEnvelopeGrant).filter(EsignEnvelopeGrant.envelope_id == envelope.id, EsignEnvelopeGrant.user_id == successor.id).delete()
            if retain_view:
                db.add(EsignEnvelopeGrant(id=uuid.uuid4(), envelope_id=envelope.id, firm_id=envelope.firm_id,
                                          user_id=previous_owner, access_level="view", granted_by_user_id=actor.id))
            audit_service.record_event(db, envelope_id=envelope.id, event_type=EsignEventType.OWNERSHIP_TRANSFERRED,
                                       actor_user_id=actor.id, actor_email=user_email,
                                       details={"previous_owner_id": previous_owner, "new_owner_id": successor.id, "previous_owner_retained_view": retain_view})
            self._audit(db, actor, "envelope.ownership_transferred", "envelope", str(envelope.id),
                        {"previous_owner_id": previous_owner, "new_owner_id": successor.id}); db.commit()
            return {"envelope_id": str(envelope.id), "owner_id": successor.id}
        except Exception: db.rollback(); raise
        finally: db.close()

    def offboard(self, actor_user_id: str, target_user_id: str, successor_user_id: str) -> dict[str, int]:
        db = self._get_session()
        try:
            actor = self._actor(db, actor_user_id, admin=True)
            target = db.query(User).filter(User.id == target_user_id, User.firm_id == actor.firm_id).first()
            successor = db.query(User).filter(User.id == successor_user_id, User.firm_id == actor.firm_id).first()
            if not target or not successor or target.id == successor.id: raise EsignError("Offboarding requires another same-firm successor")
            counts = {}
            for key, model in (("envelopes", EsignEnvelope), ("templates", EsignTemplate), ("bulk_jobs", EsignBulkJob), ("powerforms", EsignPowerForm)):
                count = db.query(model).filter(model.user_id == target.id, model.firm_id == actor.firm_id).update({model.user_id: successor.id}, synchronize_session=False)
                counts[key] = count
            db.query(EsignEnvelopeGrant).filter(EsignEnvelopeGrant.user_id == target.id).delete(synchronize_session=False)
            db.query(EsignPermissionAssignment).filter(EsignPermissionAssignment.user_id == target.id).delete(synchronize_session=False)
            target.firm_id = None
            self._audit(db, actor, "user.offboarded", "user", target.id, {"successor_user_id": successor.id, "transferred": counts})
            db.commit(); return counts
        except Exception: db.rollback(); raise
        finally: db.close()

    def create_webhook(self, user_id: str, payload: EsignWebhookConfigurationRequest, envelope_id: str | None = None) -> dict[str, Any]:
        endpoint = validate_webhook_destination(payload.endpoint_url)
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=envelope_id is None)
            env_uuid = uuid.UUID(envelope_id) if envelope_id else None
            if env_uuid:
                envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == env_uuid).first()
                if not envelope or not esign_authorization_service.envelope_access(db, actor.id, envelope, require_manage=True, capability="envelope_webhooks"):
                    raise EsignNotFound("Envelope not found")
                firm_id = envelope.firm_id
            else: firm_id = actor.firm_id
            secret = generate_webhook_secret()
            config = EsignWebhookConfiguration(id=uuid.uuid4(), firm_id=firm_id, envelope_id=env_uuid,
                endpoint_url=endpoint, enabled=payload.enabled, event_filters=payload.event_filters,
                include_completed_documents=payload.include_completed_documents, secret_current=secret, created_by_user_id=actor.id)
            db.add(config); self._audit(db, actor, "webhook.created", "webhook", str(config.id), {"scope": "envelope" if env_uuid else "firm", "endpoint": endpoint})
            db.commit(); return {**self._webhook_dict(config), "secret": secret}
        except Exception: db.rollback(); raise
        finally: db.close()

    @staticmethod
    def _webhook_dict(config: EsignWebhookConfiguration) -> dict[str, Any]:
        return {"id": str(config.id), "envelope_id": str(config.envelope_id) if config.envelope_id else None,
                "endpoint_url": config.endpoint_url, "enabled": config.enabled, "event_filters": list(config.event_filters or []),
                "include_completed_documents": config.include_completed_documents,
                "created_at": config.created_at, "updated_at": config.updated_at,
                "secret_overlap_expires_at": config.secret_previous_expires_at}

    def list_webhooks(self, user_id: str, envelope_id: str | None = None) -> list[dict[str, Any]]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=envelope_id is None); query = db.query(EsignWebhookConfiguration).filter(EsignWebhookConfiguration.firm_id == actor.firm_id)
            if envelope_id:
                envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == uuid.UUID(envelope_id)).first()
                if not envelope or not esign_authorization_service.envelope_access(db, actor.id, envelope, require_manage=False): raise EsignNotFound("Envelope not found")
                query = query.filter(EsignWebhookConfiguration.envelope_id == envelope.id)
            else: query = query.filter(EsignWebhookConfiguration.envelope_id.is_(None))
            return [self._webhook_dict(item) for item in query.order_by(EsignWebhookConfiguration.created_at.desc()).all()]
        finally: db.close()

    def rotate_secret(self, user_id: str, config_id: str) -> dict[str, Any]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id); config = db.query(EsignWebhookConfiguration).filter(EsignWebhookConfiguration.id == uuid.UUID(config_id), EsignWebhookConfiguration.firm_id == actor.firm_id).first()
            if not config: raise EsignNotFound("Webhook configuration not found")
            if config.envelope_id:
                envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == config.envelope_id).first()
                if not envelope or not esign_authorization_service.envelope_access(db, actor.id, envelope, require_manage=True): raise EsignNotFound("Webhook configuration not found")
            elif getattr(actor.role, "value", actor.role) != "admin": raise EsignNotFound("Webhook configuration not found")
            secret = generate_webhook_secret(); config.secret_previous = config.secret_current
            config.secret_previous_expires_at = datetime.now(timezone.utc) + timedelta(hours=24); config.secret_current = secret
            self._audit(db, actor, "webhook.secret_rotated", "webhook", str(config.id)); db.commit()
            return {"id": str(config.id), "secret": secret, "overlap_expires_at": config.secret_previous_expires_at}
        except Exception: db.rollback(); raise
        finally: db.close()

    def update_webhook(self, user_id: str, config_id: str, payload: EsignWebhookConfigurationRequest) -> dict[str, Any]:
        endpoint = validate_webhook_destination(payload.endpoint_url)
        db = self._get_session()
        try:
            actor = self._actor(db, user_id); config = db.query(EsignWebhookConfiguration).filter(
                EsignWebhookConfiguration.id == uuid.UUID(config_id), EsignWebhookConfiguration.firm_id == actor.firm_id).first()
            if not config: raise EsignNotFound("Webhook configuration not found")
            if config.envelope_id:
                envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == config.envelope_id).first()
                if not envelope or not esign_authorization_service.envelope_access(db, actor.id, envelope, require_manage=True):
                    raise EsignNotFound("Webhook configuration not found")
            elif getattr(actor.role, "value", actor.role) != "admin": raise EsignNotFound("Webhook configuration not found")
            config.endpoint_url, config.enabled = endpoint, payload.enabled
            config.event_filters, config.include_completed_documents = payload.event_filters, payload.include_completed_documents
            config.disabled_at = None if payload.enabled else datetime.now(timezone.utc)
            if not payload.enabled:
                db.query(EsignWebhookDelivery).filter(EsignWebhookDelivery.configuration_id == config.id,
                    EsignWebhookDelivery.status.in_(("pending", "retry", "claimed"))).update(
                        {"status": "cancelled", "next_attempt_at": None}, synchronize_session=False)
            self._audit(db, actor, "webhook.updated", "webhook", str(config.id), {"endpoint": endpoint, "enabled": payload.enabled})
            db.commit(); db.refresh(config); return self._webhook_dict(config)
        except Exception: db.rollback(); raise
        finally: db.close()

    def test_webhook(self, user_id: str, config_id: str) -> dict[str, Any]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id); config = db.query(EsignWebhookConfiguration).filter(
                EsignWebhookConfiguration.id == uuid.UUID(config_id),
                EsignWebhookConfiguration.firm_id == actor.firm_id,
            ).first()
            if not config or (config.envelope_id is None and getattr(actor.role, "value", actor.role) != "admin"):
                raise EsignNotFound("Webhook configuration not found")
            envelope = db.query(EsignEnvelope).filter(
                EsignEnvelope.id == config.envelope_id if config.envelope_id else EsignEnvelope.firm_id == actor.firm_id
            ).order_by(EsignEnvelope.created_at.desc()).first()
            if not envelope: raise EsignConflict("A firm envelope is required before sending a synthetic webhook test")
            if config.envelope_id and not esign_authorization_service.envelope_access(db, actor.id, envelope, require_manage=True):
                raise EsignNotFound("Webhook configuration not found")
            event = EsignEvent(id=uuid.uuid4(), envelope_id=envelope.id, event_type=EsignEventType.WEBHOOK_TEST,
                               actor_user_id=actor.id, actor_email=actor.email,
                               details={"status": "synthetic"}, created_at=datetime.now(timezone.utc))
            db.add(event); db.flush()
            delivery = EsignWebhookDelivery(id=uuid.uuid4(), configuration_id=config.id, event_id=event.id,
                firm_id=actor.firm_id, envelope_id=envelope.id, payload=build_event_payload(db, event, envelope),
                status="pending", next_attempt_at=datetime.now(timezone.utc))
            db.add(delivery); self._audit(db, actor, "webhook.test_queued", "webhook", str(config.id), {"delivery_id": str(delivery.id)})
            db.commit(); return {"delivery_id": str(delivery.id), "status": "pending"}
        except Exception: db.rollback(); raise
        finally: db.close()

    def disable_webhook(self, user_id: str, config_id: str) -> None:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id); config = db.query(EsignWebhookConfiguration).filter(EsignWebhookConfiguration.id == uuid.UUID(config_id), EsignWebhookConfiguration.firm_id == actor.firm_id).first()
            if not config or (config.envelope_id is None and getattr(actor.role, "value", actor.role) != "admin"): raise EsignNotFound("Webhook configuration not found")
            if config.envelope_id:
                envelope = db.query(EsignEnvelope).filter(EsignEnvelope.id == config.envelope_id).first()
                if not envelope or not esign_authorization_service.envelope_access(db, actor.id, envelope, require_manage=True): raise EsignNotFound("Webhook configuration not found")
            config.enabled = False; config.disabled_at = datetime.now(timezone.utc)
            db.query(EsignWebhookDelivery).filter(EsignWebhookDelivery.configuration_id == config.id,
                EsignWebhookDelivery.status.in_(("pending", "retry", "claimed"))).update({"status": "cancelled", "next_attempt_at": None}, synchronize_session=False)
            self._audit(db, actor, "webhook.disabled", "webhook", str(config.id)); db.commit()
        except Exception: db.rollback(); raise
        finally: db.close()

    def deliveries(self, user_id: str, *, status: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True); query = db.query(EsignWebhookDelivery).filter(EsignWebhookDelivery.firm_id == actor.firm_id)
            if status: query = query.filter(EsignWebhookDelivery.status == status)
            rows = query.order_by(EsignWebhookDelivery.created_at.desc()).limit(min(limit, 250)).all()
            return [{"id": str(row.id), "configuration_id": str(row.configuration_id), "event_id": str(row.event_id),
                     "envelope_id": str(row.envelope_id), "status": row.status, "attempt_count": row.attempt_count,
                     "next_attempt_at": row.next_attempt_at, "created_at": row.created_at} for row in rows]
        finally: db.close()

    def webhook_metrics(self, user_id: str) -> dict[str, Any]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True); now = datetime.now(timezone.utc)
            base = db.query(EsignWebhookDelivery).filter(EsignWebhookDelivery.firm_id == actor.firm_id)
            total = base.count(); succeeded = base.filter(EsignWebhookDelivery.status == "succeeded").count()
            oldest = base.filter(EsignWebhookDelivery.status.in_(("pending", "retry", "claimed"))).with_entities(
                func.min(EsignWebhookDelivery.created_at)).scalar()
            rejected = db.query(EsignWebhookAttempt).join(EsignWebhookDelivery,
                EsignWebhookDelivery.id == EsignWebhookAttempt.delivery_id).filter(
                    EsignWebhookDelivery.firm_id == actor.firm_id,
                    EsignWebhookAttempt.result == "rejected_destination").count()
            return {"pending": base.filter(EsignWebhookDelivery.status.in_(("pending", "claimed"))).count(),
                    "retrying": base.filter(EsignWebhookDelivery.status == "retry").count(),
                    "terminal": base.filter(EsignWebhookDelivery.status == "terminal").count(),
                    "success_rate": succeeded / total if total else 1.0,
                    "oldest_pending_seconds": max(0, int((now - oldest).total_seconds())) if oldest else 0,
                    "rejected_destinations": rejected}
        finally: db.close()

    def attempts(self, user_id: str, delivery_id: str) -> list[dict[str, Any]]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True); delivery = db.query(EsignWebhookDelivery).filter(
                EsignWebhookDelivery.id == uuid.UUID(delivery_id), EsignWebhookDelivery.firm_id == actor.firm_id).first()
            if not delivery: raise EsignNotFound("Webhook delivery not found")
            return [{"id": str(row.id), "attempt_number": row.attempt_number, "started_at": row.started_at,
                     "completed_at": row.completed_at, "duration_ms": row.duration_ms, "result": row.result,
                     "http_status": row.http_status, "response_excerpt": row.response_excerpt, "error": row.error}
                    for row in db.query(EsignWebhookAttempt).filter(EsignWebhookAttempt.delivery_id == delivery.id).order_by(EsignWebhookAttempt.attempt_number).all()]
        finally: db.close()

    def replay(self, user_id: str, delivery_id: str) -> dict[str, Any]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True); delivery = db.query(EsignWebhookDelivery).filter(
                EsignWebhookDelivery.id == uuid.UUID(delivery_id), EsignWebhookDelivery.firm_id == actor.firm_id).first()
            if not delivery: raise EsignNotFound("Webhook delivery not found")
            delivery.status = "retry"; delivery.next_attempt_at = datetime.now(timezone.utc); delivery.claimed_at = None; delivery.manual_retry_by_user_id = actor.id
            self._audit(db, actor, "webhook.delivery_replayed", "webhook_delivery", str(delivery.id)); db.commit()
            return {"id": str(delivery.id), "status": delivery.status, "next_attempt_at": delivery.next_attempt_at}
        except Exception: db.rollback(); raise
        finally: db.close()

    def audit_events(self, user_id: str, limit: int = 500, *, event_type: str | None = None,
                     actor_email: str | None = None, target_type: str | None = None,
                     start: datetime | None = None, end: datetime | None = None) -> list[dict[str, Any]]:
        db = self._get_session()
        try:
            actor = self._actor(db, user_id, admin=True)
            query = db.query(EsignAdminEvent).filter(EsignAdminEvent.firm_id == actor.firm_id)
            if event_type: query = query.filter(EsignAdminEvent.event_type == event_type)
            if actor_email: query = query.filter(EsignAdminEvent.actor_email.ilike(f"%{actor_email.strip()}%"))
            if target_type: query = query.filter(EsignAdminEvent.target_type == target_type)
            if start: query = query.filter(EsignAdminEvent.created_at >= start)
            if end: query = query.filter(EsignAdminEvent.created_at < end)
            return [{"id": str(row.id), "event_type": row.event_type, "actor_email": row.actor_email,
                     "target_type": row.target_type, "target_id": row.target_id, "details": row.details, "created_at": row.created_at}
                    for row in query.order_by(EsignAdminEvent.created_at.desc()).limit(min(limit, 5000)).all()]
        finally: db.close()


esign_admin_service = EsignAdminService()
