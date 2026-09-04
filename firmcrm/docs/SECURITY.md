# Security model

## Assets
Client and prospect identities, contact details, pursuit economics (fees, probabilities), conflict-of-interest and independence determinations, and the audit trail. Conflict/independence records are professional-responsibility evidence: integrity and traceability matter as much as confidentiality.

## Authentication
- Passwords: bcrypt (12 rounds), policy ≥12 chars with letters and digits, must not contain the email local-part or be a common password. Admin-set passwords force a change at next login.
- Access tokens: HS256 JWT, 15 min, carry `jti`, `typ=access`, `pwc` (password-changed timestamp) and `sid` (the refresh-token family they belong to). Tokens issued before a password change are rejected, and every request checks that the session family still has a live refresh token — so sign-out, session revocation, deactivation and reuse detection take effect immediately (one indexed lookup per request).
- Refresh tokens: 48-byte random, stored **hashed** (SHA-256), 14 days, rotated on every use. Presenting a rotated token revokes the whole token family (reuse detection). Users can list and revoke sessions; admins deactivating a user revoke all sessions.
- Brute force: per-IP rate limit on `/auth/login` and `/auth/refresh` (429), per-account lockout after 5 failures for 15 minutes (423). All outcomes audited.

## Authorization (RBAC)
Roles: `staff`, `marketing` < `manager` < `partner` < `admin`. Enforced server-side in each router; the UI only hides controls.

| Capability | staff/marketing | manager | partner | admin |
|---|:-:|:-:|:-:|:-:|
| Read all CRM data | ✓ | ✓ | ✓ | ✓ |
| Create/edit leads, accounts, contacts, opportunities, activities, campaigns | ✓ | ✓ | ✓ | ✓ |
| Run conflict / independence checks | ✓ | ✓ | ✓ | ✓ |
| Resolve a *pending* check: clear / conflict (not when an independence relationship was disclosed) | | ✓ | ✓ | ✓ |
| Resolve a check with a disclosed independence relationship; change a resolved decision (override, note required, prior decision retained) | | | ✓ | ✓ |
| **Waive** a conflict (requires written basis) | | | ✓ | ✓ |
| Archive / restore records (incl. leads), reopen closed opportunities, edit engagements | | ✓ | ✓ | ✓ |
| Export CSV, import CSV, view audit log | | ✓ | ✓ | ✓ |
| Raise / lift ethical walls, manage wall members | | | ✓ | ✓ |
| Hard delete (purge) | | | | ✓ |
| Users, practice areas, pipeline stages | | | | ✓ |

**Ethical walls (record-level visibility).** A partner or admin can raise a wall on an account or a single opportunity with a written reason. While active, the record and everything under it (contacts, opportunities, engagements, activities, conflict checks, exports) is visible only to wall members; everyone else receives 404 (never 403, so existence is not disclosed) and the record disappears from lists, search and the dashboard's record-level panels. Conflict search still matches walled parties but redacts the matter context and ids for non-members, so conflicts are never missed. Admins bypass walls by default (`ADMIN_BYPASSES_WALLS=true`); set it false for a strict regime. Firm-wide aggregate reports are intentionally unaffected. Every wall action is audited (`wall.*`).

Business gates independent of role: Closed Won creates exactly one engagement per opportunity — re-winning a reopened opportunity reactivates it; reopening puts it on hold; losing it after a win terminates it and the account's *client* status is reverted when no other won work supports it (all audited). Reopen is refused on open opportunities. Inactive practice areas cannot be used on new records. A wall member cannot remove themselves unless another partner/admin remains inside the wall.

Business gates independent of role (continued): Closed Won requires a cleared/waived clearance check (where the practice area mandates one) **and** a signed engagement letter; marking lost requires a reason; unqualifying a lead requires a reason.

## Data protection
- Archive instead of delete; archived accounts/contacts remain in conflict searches (former clients are still conflict-relevant).
- Every mutation writes an `audit_log` row (actor, action, entity, before/after JSON, note). Exports are audited with row counts.
- Imports validate each row with the API schemas and never modify the uploaded file; dry runs write nothing but are recorded.
- Transport: HSTS in production; API responses `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, CSP `default-src 'none'`. The SPA has its own CSP in nginx.
- Request size capped (10 MB) at nginx and the API. Input lengths bounded in schemas; enums validated with `Literal` types (frontend kept in sync by test).
- No secrets in code; production refuses default secrets, localhost CORS, and SQLite.

## Logging & monitoring
JSON logs with `request_id`, `user_id`, method, path, status, duration, client IP. Optional Sentry. Readiness probe verifies DB + migration head.

## Known gaps / roadmap
- Ethical walls restrict *records*; aggregate report totals still include walled opportunities (by design, so firm KPIs stay consistent). If a deployment needs aggregate suppression, filter `services/reports.py` with `services/visibility`.
- No SSO/OIDC or MFA yet. Recommended before rollout to a firm: OIDC against the firm IdP, with `role` mapped from IdP groups.
- Rate limiting is shared via Redis when `REDIS_URL` is set; without Redis it is per-process (see RUNBOOK §8).
- Conflict matching is string-based (normalisation + token containment + difflib). It will not find related parties, beneficial owners, or affiliates unless they are recorded as aliases/adverse parties.
- No field-level encryption at rest; rely on database/disk encryption.

## Reporting a vulnerability
Open a private issue or contact the maintainer directly; do not post exploit details publicly.
