"""External delivery of watchlist notifications through user-owned channels (webhook / email).

Pipeline
    record_change() -> Notification rows (services.changes)  ->  dispatch_pending()  ->  webhook POST / SMTP

dispatch_pending(db=None, now=None) is the single entry point (scheduler interval job and
`python -m app.crawler dispatch-notifications`). It never raises: every failure is recorded on the
DeliveryAttempt and the DeliveryChannel.

Delivery model
- One DeliveryAttempt per (channel, notification, attempt_no). Only notifications created at or after
  the channel itself are considered (no backfill flood when a channel is added).
- Filters (tax_types / jurisdiction_codes / change_types) are evaluated once; non-matching
  notifications get a single `skipped` attempt so they are never re-scanned.
- Instant channels: one request per notification. Daily digest channels: one bundled request per
  channel, only when last_delivered_at is None or >= 24h old.
- Failure -> status `failed`, next_attempt_at = now + backoff (1m, 5m, 30m, 2h, 12h). A retry creates
  attempt_no + 1 and clears next_attempt_at on the previous row. After `notify_max_attempts` the
  attempt is `dead`. Each failed request increments channel.consecutive_failures (reset on success);
  at AUTO_DISABLE_AFTER the channel is disabled with disabled_reason.
- Email requires SMTP_HOST; without it email attempts fail with "SMTP not configured" (then retry/dead).

Webhook contract (documented for integrators; see also api/taxatlas/v1/delivery.py)
    POST <target>  Content-Type: application/json
    X-TaxAtlas-Event:     change.detected | change.digest | test
    X-TaxAtlas-Delivery:  <attempt id>  (or "digest:<channel>:<ts>" / "test:<channel>:<ts>")
    X-TaxAtlas-Signature: sha256=<hex HMAC-SHA256(secret, raw request body)>
    X-TaxAtlas-Timestamp: <unix seconds at send time>
    X-TaxAtlas-Signature-V2: sha256=<hex HMAC-SHA256(secret, f"{timestamp}.".encode() + raw body)>
        Replay protection: verify V2 and reject when |now - timestamp| > 300 s (SIGNATURE_TOLERANCE_SECONDS).
        The v1 body-only header is kept for existing integrations.
    X-TaxAtlas-Signature-V2-Previous: same recipe with the *previous* secret; present only during the 24 h grace
        window after POST /account/delivery/{id}/rotate-secret (SECRET_ROTATION_GRACE), so a receiver can switch
        secrets without dropping deliveries. Accept a delivery when either V2 header verifies.
    Body (change.detected):
        {"id": <notification id>, "event": "change.detected", "created_at": "<iso8601>",
         "change": <ChangeEventOut>, "jurisdiction": {"code","name","level"} | null,
         "links": {"api": "<public_url>/api/taxatlas/v1/changes?...", "ui": "<public_url>/dashboard/taxatlas/changes?event=<id>"}}
    Body (change.digest): {"id", "event": "change.digest", "created_at", "count", "changes": [<item>...], "links"}
    Body (test):          {"id", "event": "test", "created_at", "message", "links"}
    Any 2xx = delivered. Redirects are not followed. Timeout = WEBHOOK_TIMEOUT_SECONDS.

Verification (Python):
    import hmac, hashlib, time
    ts = request.headers["X-TaxAtlas-Timestamp"]
    if abs(time.time() - int(ts)) > 300:
        reject("stale or replayed delivery")
    expected = "sha256=" + hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers["X-TaxAtlas-Signature-V2"]):
        reject("bad signature")
    # equivalent: verify_signature_v2(secret, raw_body, ts, request.headers["X-TaxAtlas-Signature-V2"])
    # legacy receivers: "sha256=" + HMAC-SHA256(secret, raw_body) == X-TaxAtlas-Signature (no replay protection)
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import logging
import secrets
import smtplib
import socket
import time
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from html import escape
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from taxatlas.core.config import get_settings
from taxatlas.models import ChangeEvent, Jurisdiction, Notification, User, UserRole
from taxatlas.models.delivery import AttemptStatus, DeliveryAttempt, DeliveryChannel, DeliveryKind, DigestMode
from taxatlas.services.changes import change_event_out

log = logging.getLogger("taxatlas.notifications")

BACKOFF_SECONDS = (60, 300, 1800, 7200, 43200)  # 1m, 5m, 30m, 2h, 12h
AUTO_DISABLE_AFTER = 20  # consecutive failed requests
DIGEST_INTERVAL = timedelta(hours=24)
MAX_NEW_PER_CHANNEL_PER_RUN = 100
EVENT_CHANGE = "change.detected"
EVENT_DIGEST = "change.digest"
EVENT_TEST = "test"


class DeliveryError(Exception):
    """Raised internally by senders; converted into attempt failures."""


# --------------------------------------------------------------------------- helpers


def utcnow() -> datetime:
    return datetime.now(UTC)


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def _iso(dt: datetime | None) -> str | None:
    a = _aware(dt)
    return a.isoformat() if a else None


def generate_secret() -> str:
    return "whsec_" + secrets.token_urlsafe(32)


def sign(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def verify_signature(secret: str, body: bytes, header_value: str | None) -> bool:
    return bool(header_value) and hmac.compare_digest(sign(secret, body), header_value or "")


SIGNATURE_TOLERANCE_SECONDS = 300
SECRET_ROTATION_GRACE = timedelta(hours=24)


def sign_v2(secret: str, timestamp: int | str, body: bytes) -> str:
    """Timestamped signature: `sha256=<hex HMAC-SHA256(secret, f"{timestamp}.".encode() + body)>`."""
    mac = hmac.new(secret.encode("utf-8"), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return f"sha256={mac}"


def verify_signature_v2(
    secret: str,
    body: bytes,
    timestamp_header: str | None,
    signature_header: str | None,
    *,
    tolerance_seconds: int = SIGNATURE_TOLERANCE_SECONDS,
    now: int | None = None,
) -> bool:
    """Verify X-TaxAtlas-Signature-V2 against X-TaxAtlas-Timestamp; reject when |now - timestamp| > tolerance."""
    if not timestamp_header or not signature_header:
        return False
    try:
        ts = int(timestamp_header)
    except ValueError:
        return False
    if abs((now if now is not None else int(time.time())) - ts) > tolerance_seconds:
        return False
    return hmac.compare_digest(sign_v2(secret, ts, body), signature_header)


def previous_secret_in_grace(channel: DeliveryChannel, now: datetime | None = None) -> str | None:
    """The rotated-out secret while its grace window is open, else None."""
    if not channel.previous_secret or channel.previous_secret_expires_at is None:
        return None
    exp = _aware(channel.previous_secret_expires_at)
    return channel.previous_secret if exp is not None and exp > (now or utcnow()) else None


def encode_body(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False, default=str).encode("utf-8")


def backoff_for(attempt_no: int) -> timedelta:
    idx = max(0, min(attempt_no - 1, len(BACKOFF_SECONDS) - 1))
    return timedelta(seconds=BACKOFF_SECONDS[idx])


def validate_target_url(url: str, *, allow_private: bool | None = None) -> str:
    """SSRF guard for webhook targets. Raises ValueError with a user-facing message.

    In APP_ENV=development any http(s) URL is accepted (local receivers are the norm). Elsewhere,
    hostnames that resolve to loopback / private / link-local / reserved ranges are rejected.
    """
    url = (url or "").strip()
    p = urlparse(url)
    if p.scheme not in ("http", "https"):
        raise ValueError("Webhook URL must use http or https")
    if not p.hostname:
        raise ValueError("Webhook URL must include a host")
    if p.username or p.password:
        raise ValueError("Webhook URL must not embed credentials")
    if len(url) > 1000:
        raise ValueError("Webhook URL is too long")
    if allow_private is None:
        allow_private = get_settings().app_env == "development"
    if allow_private:
        return url
    host = p.hostname.lower().rstrip(".")
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        raise ValueError("Webhook URL must not target a local host")
    try:
        addrs = [ipaddress.ip_address(host)]
    except ValueError:
        try:
            port = p.port or (443 if p.scheme == "https" else 80)
            infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
        except (socket.gaierror, OSError):
            raise ValueError(f"Could not resolve webhook host '{host}'")
        addrs = [ipaddress.ip_address(info[4][0]) for info in infos]
    for ip in addrs:
        mapped = ip.ipv4_mapped if isinstance(ip, ipaddress.IPv6Address) else None
        check = mapped or ip
        if not check.is_global:
            raise ValueError("Webhook URL must not target a private, loopback, or link-local address")
    return url


def _jurisdiction_codes_up(db: Session, jurisdiction_id: int | None) -> set[str]:
    codes: set[str] = set()
    cur = db.get(Jurisdiction, jurisdiction_id) if jurisdiction_id else None
    depth = 0
    while cur is not None and depth < 10:
        codes.add(cur.code.upper())
        cur = db.get(Jurisdiction, cur.parent_id) if cur.parent_id else None
        depth += 1
    return codes


def matches_filters(db: Session, ev: ChangeEvent, filters: dict | None) -> bool:
    if not filters:
        return True
    tax_types = filters.get("tax_types") or []
    if tax_types and ev.tax_type not in tax_types:
        return False
    change_types = filters.get("change_types") or []
    if change_types and ev.change_type not in change_types:
        return False
    codes = [c.upper() for c in (filters.get("jurisdiction_codes") or [])]
    if codes and not (_jurisdiction_codes_up(db, ev.jurisdiction_id) & set(codes)):
        return False
    return True


# --------------------------------------------------------------------------- payloads


def _links(ev: ChangeEvent | None) -> dict[str, str]:
    base = get_settings().public_url.rstrip("/")
    if ev is None:
        return {"api": f"{base}/api/taxatlas/v1/changes", "ui": f"{base}/dashboard/taxatlas/changes"}
    params: dict[str, str] = {"entity_type": ev.entity_type, "change_type": ev.change_type}
    if ev.jurisdiction is not None:
        params["jurisdiction"] = ev.jurisdiction.code
    if ev.detected_at:
        # urlencode: an ISO offset like "+00:00" left raw would decode as a space and fail datetime parsing
        params["since"] = _iso(ev.detected_at) or ""
    return {
        "api": f"{base}/api/taxatlas/v1/changes?{urlencode(params)}",
        "ui": f"{base}/dashboard/taxatlas/changes?event={ev.id}",
    }


def _is_admin(channel: DeliveryChannel) -> bool:
    return bool(channel.user is not None and channel.user.is_system_admin)


def change_item(notification: Notification, *, admin: bool = False) -> dict[str, Any]:
    ev: ChangeEvent = notification.change_event
    jur = ev.jurisdiction
    return {
        "id": notification.id,
        "created_at": _iso(notification.created_at),
        # editor identity (_meta.edited_by) is redacted unless the channel owner is an admin
        "change": change_event_out(ev, admin=admin).model_dump(mode="json"),
        "jurisdiction": {"code": jur.code, "name": jur.name, "level": jur.level} if jur else None,
        "links": _links(ev),
    }


def build_change_payload(notification: Notification, *, admin: bool = False) -> dict[str, Any]:
    item = change_item(notification, admin=admin)
    return {"id": item["id"], "event": EVENT_CHANGE, **{k: v for k, v in item.items() if k != "id"}}


def build_digest_payload(channel: DeliveryChannel, notifications: list[Notification], now: datetime) -> dict:
    items = [change_item(n, admin=_is_admin(channel)) for n in notifications]
    return {
        "id": f"digest:{channel.id}:{int(now.timestamp())}",
        "event": EVENT_DIGEST,
        "created_at": now.isoformat(),
        "count": len(items),
        "changes": items,
        "links": _links(None),
    }


def build_test_payload(channel: DeliveryChannel, now: datetime) -> dict[str, Any]:
    base = get_settings().public_url.rstrip("/")
    return {
        "id": f"test:{channel.id}:{int(now.timestamp())}",
        "event": EVENT_TEST,
        "created_at": now.isoformat(),
        "message": f"TaxAtlas delivery test for channel #{channel.id} ({channel.kind} -> {channel.target})",
        "links": {
            "api": f"{base}/api/taxatlas/v1/changes",
            "ui": f"{base}/dashboard/taxatlas/account",
        },
    }


# --------------------------------------------------------------------------- senders


def post_webhook(channel: DeliveryChannel, payload: dict[str, Any], *, event: str, delivery_id: str) -> int:
    """POST the signed payload. Returns the HTTP status on 2xx; raises DeliveryError otherwise."""
    settings = get_settings()
    try:
        validate_target_url(channel.target)
    except ValueError as exc:
        raise DeliveryError(f"target rejected: {exc}")
    body = encode_body(payload)
    ts = int(time.time())
    headers = {
        "Content-Type": "application/json",
        "User-Agent": settings.crawler_user_agent,
        "X-TaxAtlas-Event": event,
        "X-TaxAtlas-Delivery": delivery_id,
        "X-TaxAtlas-Signature": sign(channel.secret or "", body),
        "X-TaxAtlas-Timestamp": str(ts),
        "X-TaxAtlas-Signature-V2": sign_v2(channel.secret or "", ts, body),
    }
    prev = previous_secret_in_grace(channel)
    if prev:
        headers["X-TaxAtlas-Signature-V2-Previous"] = sign_v2(prev, ts, body)
    try:
        with httpx.Client(timeout=settings.webhook_timeout_seconds, follow_redirects=False) as client:
            resp = client.post(channel.target, content=body, headers=headers)
    except httpx.HTTPError as exc:
        raise DeliveryError(f"{type(exc).__name__}: {str(exc)[:300]}")
    if 200 <= resp.status_code < 300:
        return resp.status_code
    raise DeliveryError(f"HTTP {resp.status_code}: {resp.text[:300]}", resp.status_code)


def send_email(to_addr: str, subject: str, text: str, html: str | None = None) -> None:
    """Send via SMTP using Settings. Raises DeliveryError on any failure or when SMTP is not configured."""
    settings = get_settings()
    if not settings.smtp_host:
        raise DeliveryError("SMTP not configured")
    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.webhook_timeout_seconds) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        raise DeliveryError(f"{type(exc).__name__}: {str(exc)[:300]}")


def _render_items_text(items: list[dict[str, Any]]) -> str:
    lines = []
    for it in items:
        ch = it["change"]
        jur = it["jurisdiction"]["code"] if it["jurisdiction"] else "-"
        lines.append(f"- [{jur}] {ch['change_type']} {ch['entity_type']}: {ch['title']}\n  {it['links']['ui']}")
    return "\n".join(lines)


def _render_items_html(items: list[dict[str, Any]]) -> str:
    rows = []
    for it in items:
        ch = it["change"]
        jur = it["jurisdiction"]["code"] if it["jurisdiction"] else "-"
        rows.append(
            f"<li><strong>[{escape(jur)}]</strong> {escape(ch['change_type'])} {escape(ch['entity_type'])}: "
            f'<a href="{escape(it["links"]["ui"])}">{escape(ch["title"])}</a></li>'
        )
    return "<ul>" + "".join(rows) + "</ul>"


def render_email(payload: dict[str, Any]) -> tuple[str, str, str]:
    """Return (subject, text, html) for a change / digest / test payload."""
    app = get_settings().app_name
    event = payload["event"]
    if event == EVENT_CHANGE:
        title = payload["change"]["title"]
        subject = f"[{app}] {title}"[:200]
        items = [payload]
    elif event == EVENT_DIGEST:
        subject = f"[{app}] Daily digest: {payload['count']} tax change(s)"
        items = payload["changes"]
    else:
        subject = f"[{app}] Delivery test"
        text = f"{payload['message']}\n\nIf you received this, your email channel is working.\n{payload['links']['ui']}"
        html = f"<p>{escape(payload['message'])}</p><p>If you received this, your email channel is working.</p>"
        return subject, text, html
    manage = get_settings().public_url.rstrip("/") + "/dashboard/taxatlas/account"
    text = f"{app} detected the following change(s):\n\n{_render_items_text(items)}\n\nManage channels: {manage}"
    html = (
        f"<p>{escape(app)} detected the following change(s):</p>{_render_items_html(items)}"
        f'<p style="color:#666;font-size:12px">Manage delivery channels in your '
        f'<a href="{escape(manage)}">account settings</a>.</p>'
    )
    return subject, text, html


def deliver(channel: DeliveryChannel, payload: dict[str, Any], *, event: str, delivery_id: str) -> int | None:
    """Send one payload through a channel. Returns http status (webhook) or None (email); raises DeliveryError."""
    if channel.kind == DeliveryKind.WEBHOOK:
        return post_webhook(channel, payload, event=event, delivery_id=delivery_id)
    if channel.kind == DeliveryKind.EMAIL:
        subject, text, html = render_email(payload)
        send_email(channel.target, subject, text, html)
        return None
    raise DeliveryError(f"unknown channel kind '{channel.kind}'")


# --------------------------------------------------------------------------- dispatch


def _new_notifications(db: Session, channel: DeliveryChannel) -> list[Notification]:
    has_attempt = exists().where(
        DeliveryAttempt.channel_id == channel.id, DeliveryAttempt.notification_id == Notification.id
    )
    q = (
        select(Notification)
        .where(Notification.user_id == channel.user_id, ~has_attempt)
        .order_by(Notification.id.asc())
        .limit(MAX_NEW_PER_CHANNEL_PER_RUN)
    )
    # Compare against the stored column (same storage format on every backend) rather than a bound
    # Python datetime: SQLite's CURRENT_TIMESTAMP has no microseconds, so a bound value would sort wrong.
    created = select(DeliveryChannel.created_at).where(DeliveryChannel.id == channel.id).scalar_subquery()
    q = q.where(Notification.created_at >= created)
    return list(db.scalars(q))


def _retry_due(db: Session, channel: DeliveryChannel, now: datetime) -> list[DeliveryAttempt]:
    """Previous attempts whose retry is due (failed + next_attempt_at <= now) or stuck pending."""
    rows = list(
        db.scalars(
            select(DeliveryAttempt).where(
                DeliveryAttempt.channel_id == channel.id,
                DeliveryAttempt.status.in_([AttemptStatus.FAILED, AttemptStatus.PENDING]),
            )
        )
    )
    due = []
    for a in rows:
        if a.status == AttemptStatus.PENDING:
            due.append(a)
        elif a.next_attempt_at is not None and _aware(a.next_attempt_at) <= now:
            due.append(a)
    return due


def _prepare_attempts(db: Session, channel: DeliveryChannel, now: datetime, stats: dict[str, int]) -> list:
    """Create/collect the attempt rows to send now for this channel. Commits so a crash leaves `pending` rows."""
    to_send: list[DeliveryAttempt] = []
    for n in _new_notifications(db, channel):
        ev = n.change_event
        if ev is None or not matches_filters(db, ev, channel.filters):
            db.add(
                DeliveryAttempt(channel_id=channel.id, notification_id=n.id, attempt_no=1, status=AttemptStatus.SKIPPED)
            )
            stats["skipped"] += 1
            continue
        a = DeliveryAttempt(channel_id=channel.id, notification_id=n.id, attempt_no=1, status=AttemptStatus.PENDING)
        db.add(a)
        to_send.append(a)
    for prev in _retry_due(db, channel, now):
        if prev.status == AttemptStatus.PENDING:
            to_send.append(prev)
            continue
        prev.next_attempt_at = None
        a = DeliveryAttempt(
            channel_id=channel.id,
            notification_id=prev.notification_id,
            attempt_no=prev.attempt_no + 1,
            status=AttemptStatus.PENDING,
        )
        db.add(a)
        to_send.append(a)
    db.commit()
    return to_send


def _record_result(
    db: Session,
    channel: DeliveryChannel,
    attempts: list[DeliveryAttempt],
    *,
    now: datetime,
    http_status: int | None,
    error: str | None,
    stats: dict[str, int],
) -> None:
    max_attempts = max(1, get_settings().notify_max_attempts)
    if error is None:
        for a in attempts:
            a.status = AttemptStatus.SENT
            a.http_status = http_status
            a.error = None
            a.next_attempt_at = None
            stats["sent"] += 1
        channel.last_delivered_at = now
        channel.last_error = None
        channel.consecutive_failures = 0
    else:
        for a in attempts:
            a.http_status = http_status
            a.error = error[:2000]
            if a.attempt_no >= max_attempts:
                a.status = AttemptStatus.DEAD
                a.next_attempt_at = None
                stats["dead"] += 1
            else:
                a.status = AttemptStatus.FAILED
                a.next_attempt_at = now + backoff_for(a.attempt_no)
                stats["failed"] += 1
        channel.last_error = error[:2000]
        channel.consecutive_failures = (channel.consecutive_failures or 0) + 1
        if channel.consecutive_failures >= AUTO_DISABLE_AFTER and channel.enabled:
            channel.enabled = False
            channel.disabled_reason = f"auto-disabled after {channel.consecutive_failures} consecutive failures"
            stats["auto_disabled"] += 1
            log.warning("delivery channel %s auto-disabled: %s", channel.id, error[:200])
    db.commit()


def _send_group(
    db: Session,
    channel: DeliveryChannel,
    attempts: list[DeliveryAttempt],
    payload: dict[str, Any],
    *,
    event: str,
    delivery_id: str,
    now: datetime,
    stats: dict[str, int],
) -> None:
    http_status: int | None = None
    error: str | None = None
    try:
        http_status = deliver(channel, payload, event=event, delivery_id=delivery_id)
    except DeliveryError as exc:
        error = str(exc.args[0]) if exc.args else "delivery failed"
        http_status = exc.args[1] if len(exc.args) > 1 else None
    except Exception as exc:  # defensive: never let one channel take down the run
        error = f"{type(exc).__name__}: {str(exc)[:300]}"
    log.info(
        "delivery channel=%s kind=%s event=%s id=%s attempts=%s -> %s%s",
        channel.id,
        channel.kind,
        event,
        delivery_id,
        [a.attempt_no for a in attempts],
        "sent" if error is None else "failed",
        f" http={http_status}" if http_status else "",
    )
    if error:
        log.info("delivery channel=%s error: %s", channel.id, error[:300])
    _record_result(db, channel, attempts, now=now, http_status=http_status, error=error, stats=stats)


def _dispatch_channel(db: Session, channel: DeliveryChannel, now: datetime, stats: dict[str, int]) -> None:
    if channel.digest == DigestMode.DAILY:
        last = _aware(channel.last_delivered_at)
        if last is not None and now - last < DIGEST_INTERVAL:
            stats["deferred"] += 1
            return
    attempts = _prepare_attempts(db, channel, now, stats)
    if not attempts:
        return
    if channel.digest == DigestMode.DAILY:
        notifications = [a.notification for a in attempts]
        payload = build_digest_payload(channel, notifications, now)
        _send_group(db, channel, attempts, payload, event=EVENT_DIGEST, delivery_id=payload["id"], now=now, stats=stats)
        return
    for a in attempts:
        payload = build_change_payload(a.notification, admin=_is_admin(channel))
        _send_group(db, channel, [a], payload, event=EVENT_CHANGE, delivery_id=str(a.id), now=now, stats=stats)
        if not channel.enabled:  # auto-disabled mid-run
            break


def dispatch_pending(db: Session | None = None, now: datetime | None = None) -> dict[str, int]:
    """Deliver all due notifications through every enabled channel. Never raises."""
    stats = {"channels": 0, "sent": 0, "failed": 0, "dead": 0, "skipped": 0, "deferred": 0, "auto_disabled": 0}
    own = db is None
    if own:
        from taxatlas.core.db import SessionLocal

        db = SessionLocal()
    try:
        now = now or utcnow()
        try:
            channels = list(
                db.scalars(
                    select(DeliveryChannel)
                    .join(User, User.id == DeliveryChannel.user_id)
                    .where(DeliveryChannel.enabled.is_(True))
                )
            )
        except Exception as exc:  # tables missing, DB down
            log.warning("notify-dispatch: could not read channels (%s)", exc)
            return stats
        for ch in channels:
            stats["channels"] += 1
            try:
                _dispatch_channel(db, ch, now, stats)
            except Exception as exc:
                log.exception("notify-dispatch: channel %s failed unexpectedly: %s", ch.id, exc)
                try:
                    db.rollback()
                except Exception:
                    pass
        if stats["sent"] or stats["failed"] or stats["dead"] or stats["skipped"]:
            log.info("notify-dispatch: %s", stats)
        return stats
    finally:
        if own and db is not None:
            db.close()


def send_test_event(channel: DeliveryChannel, now: datetime | None = None) -> dict[str, Any]:
    """Synchronously deliver a signed test event. Does not create attempt rows or touch channel state."""
    now = now or utcnow()
    payload = build_test_payload(channel, now)
    started = time.monotonic()
    result: dict[str, Any] = {"ok": True, "event_id": payload["id"], "status_code": None, "error": None}
    try:
        result["status_code"] = deliver(channel, payload, event=EVENT_TEST, delivery_id=payload["id"])
    except DeliveryError as exc:
        result["ok"] = False
        result["error"] = str(exc.args[0]) if exc.args else "delivery failed"
        result["status_code"] = exc.args[1] if len(exc.args) > 1 else None
    except Exception as exc:
        result["ok"] = False
        result["error"] = f"{type(exc).__name__}: {str(exc)[:300]}"
    result["duration_ms"] = int((time.monotonic() - started) * 1000)
    return result


__all__ = [
    "AUTO_DISABLE_AFTER",
    "BACKOFF_SECONDS",
    "DeliveryError",
    "build_change_payload",
    "build_digest_payload",
    "build_test_payload",
    "dispatch_pending",
    "generate_secret",
    "matches_filters",
    "previous_secret_in_grace",
    "send_test_event",
    "sign",
    "sign_v2",
    "validate_target_url",
    "verify_signature",
    "verify_signature_v2",
]
