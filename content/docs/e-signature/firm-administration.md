---
title: "Firm Administration and Webhooks"
description: "Manage firm-wide E-Signature permissions, branding, defaults, custody, sharing, and authenticated outbound webhooks."
order: 6
---

Firm administrators can open **E-Signature > Admin** to oversee the firm's envelopes without changing their private ownership. The workspace summarizes envelope volume, users, send failures, upcoming expirations, webhook failures, and records whose owner is no longer in the firm.

## Permissions and firm features

Every non-administrator has an E-Signature permission profile. The locked built-in profiles are **Sender**, **Firm Operator**, **Read-only Auditor**, and **Restricted**. Clone a built-in profile when you need a custom capability set; built-ins cannot be edited.

Access to scheduled sending, bulk sends, PowerForms, advanced recipient roles, reassignment, signer attachments, and envelope webhooks requires both the firm feature and the user's profile permission. Firm administrators have an unconditional administrative override. Mandatory consent, MFA evidence, audit recording, sealing, and certificates are never controlled by these settings.

## Sharing and custody

An envelope owner or firm administrator can give a same-firm user **View** or **Manage** access from the envelope Access panel. Manage access permits draft editing, sending, corrections, reminders, voiding, downloads, and envelope webhook management. Only the owner or a firm administrator can delete a draft, change sharing, or transfer custody.

Custody transfer changes the operational owner without rewriting the immutable historical sender. A normal transfer can retain view access for the previous owner. Offboarding transfers the departing member's envelopes, templates, bulk jobs, and PowerForms to a same-firm successor in one transaction, then removes the old member's access.

## Branding and defaults

Brand profiles contain a PNG or JPEG logo (maximum 2 MB), accessible colors, email header and footer content, reply-to address, welcome text, and a support URL. The authenticated email sender remains the CPAAutomation mail domain.

New drafts receive the firm's current defaults. Locked settings and feature availability are checked again when the envelope is sent. At send time the resolved settings and brand are snapshotted onto the envelope, so later administrative changes do not alter an active or completed signing ceremony.

## Outbound webhook contract

Firm webhooks are administered under **Admin > Webhooks**. Authorized owners and managers can also configure a webhook for one envelope. Endpoints must use HTTPS on port 443 and must not resolve to private, loopback, link-local, or reserved addresses. Redirects are disabled.

The secret is 32 random bytes and is displayed only when the configuration is created or rotated. Rotation keeps the previous secret valid for 24 hours. Store the secret in a secret manager.

Each request uses compact JSON and these versioned headers:

| Header | Meaning |
| --- | --- |
| `X-CPAA-Webhook-Version` | Signature contract version (`1`) |
| `X-CPAA-Delivery-ID` | Stable delivery ID; use this for deduplication |
| `X-CPAA-Event-ID` | Immutable envelope event ID |
| `X-CPAA-Timestamp` | Unix timestamp used in the signature |
| `X-CPAA-Signature-256` | `sha256=` followed by the lowercase HMAC digest |

Verify the signature over the exact received bytes:

```text
HMAC-SHA256(secret, timestamp + "." + raw_request_body)
```

Reject stale timestamps according to your own replay window and compare digests in constant time. Delivery is at least once, so persist `X-CPAA-Delivery-ID` before performing side effects.

The versioned payload includes the event, firm, envelope, historical sender, optional recipient, source, timestamps, current status, and a small allowlist of event details. It never includes IP addresses, user-agent strings, MFA evidence, raw documents, or secrets. When completion links are enabled, links expire after 15 minutes and are refreshed for every attempt.

Any `2xx` response succeeds. Network errors, timeouts, and non-`2xx` responses retry after 5 minutes, 15 minutes, 1 hour, 6 hours, 1 day, 3 days, 7 days, and 15 days. Administrators can inspect the capped response excerpt and sanitized error for every attempt, then manually replay a delivery. Delivery payloads and attempts are retained for 90 days; administration audit events are retained indefinitely.

Webhook dispatch is off by default for rollout safety. Set `ESIGN_WEBHOOK_DISPATCH_ENABLED=true` after the canary succeeds; return it to `false` as the emergency global kill switch. Pausing dispatch does not delete configuration or diagnostics.
