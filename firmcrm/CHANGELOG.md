# Changelog

## 0.3.1 — 2026-08-23 (QA round)
- Guided product tour: "Demo now" on the login page and top bar runs a 14-step spotlight walkthrough across the real app (auto-play, keyboard, replay from the user menu).
- Sessions: access tokens are bound to their refresh-token family; revocation, sign-out-everywhere, deactivation and reuse detection take effect on the next request instead of at token expiry.
- Dashboard: honest prior-period deltas (Won QTD vs. same point of the prior quarter; leads/opportunities created 30d vs prior 30d). TagInput for tags/adverse parties; styled date pickers; seeded opportunity names are matter-only.
- Design QA (3 reviewers, 62 findings) and functional QA (24 findings) run against the live app; every P0/P1 fixed and re-verified.
- Data integrity: one engagement per opportunity (unique index + repair migration); re-win reactivates, reopen puts on hold, lost terminates; client status reverts when unsupported; reopen refuses open opportunities.
- Clearance authority: disclosed independence relationships require a partner; resolved decisions are final for managers; partner overrides require a note and keep the prior decision in the audit log.
- RBAC/validation: lead archive manager+, wall self-lockout guard, inactive practice areas rejected, `lost_reason` enum, engagement account validation, importer exceptions carry row context.
- Lists: server-side sorting across pages (`sort`/`dir`), responsive column hiding, fixed table layouts, two-line rows.
- UI: accessible modals (focus trap/restore), ConfirmDialog/ReasonDialog replace native prompts, drawers for Run check / Mark lost, overflow menus, inline form validation, money/password fields, styled checkboxes, icon-rail sidebar under 1180px, AA-contrast tertiary text, 404 page, change-password route, wall admin actions.

## 0.3.0 — 2026-08-22
- Design system "finance-grade editorial" (Direction B of three evaluated proposals, see `design/proposals/`): Geist type with tabular numerals, warm sand neutrals with one indigo accent, hairline tables with dot statuses, KPI tiles with sparklines, open Kanban columns with docked Won/Lost strip, Ramp-style stage rail, Stripe-style key-facts grids, grouped sidebar, ⌘K search field; no gradients, no load animations.
- Ethical walls: partner/admin-managed record-level restrictions on accounts or opportunities; enforced across every record endpoint and export; conflict search redacts restricted matters; admin tab + record-page panel.
- Redis-backed rate limiting shared across workers (`REDIS_URL`), fail-open with logging; compose adds `redis`; readiness reports the limiter backend.
- Black-box e2e suite (`make e2e`) run against the Docker stack, also in CI.

## 0.2.0 — 2026-08-22 (production hardening)
- Alembic owns the schema; startup refuses to serve if migrations are behind (production). Validated on SQLite and Postgres 16.
- Auth: rotating refresh tokens with reuse detection, session list/revoke, lockout after 5 failures, per-IP rate limit, password policy, forced change for admin-set passwords, tokens invalidated on password change.
- Strict `Literal` validation and length limits on all inputs; consistent 422/409 bodies; `Page` envelope on every list endpoint.
- Archive/restore replaces hard delete (admin-only purge remains); duplicate guards for account names/aliases and contact emails; archived records stay in conflict search.
- CSV export (streamed, audited) and import (dry run, row-level exception report, idempotent upsert, job history).
- JSON structured logs with request/user ids, readiness probe, security headers, body-size limit, optional Sentry.
- Test suite: 49 tests, 96% coverage with an 85% floor; frontend enum sync test; production config guard tests.
- Docker images (API, nginx SPA), compose stack with Postgres/seed/backup profiles, GitHub Actions CI including a compose smoke test.
- Frontend: silent refresh, session-expiry notice, error boundary, server-side pagination, archive UI, export buttons, import wizard, settings page.

## 0.1.0 — 2026-08-22
- Initial CRM: leads, accounts, contacts, opportunities (Kanban), clearance checks gating Closed Won, engagements, campaigns, reports, admin, audit log.
