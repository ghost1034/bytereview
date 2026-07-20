# CPAAutomation E-Signature Remediation Plan

## Summary

The audit found a strong feature base but several production-critical consistency gaps and many workflows whose backend support is not completed in the UI. Prioritize record integrity and recoverability before expanding DocuSign parity.

Current baseline: production frontend build, TypeScript check, and 9 targeted E-Signature Vitest tests pass. Backend tests exist but could not be executed because pytest is unavailable in the current environment.

## Remediation Findings

### P1 — Ceremony, editor, and correction completeness

10. Configured date formats disagree between client and server. Use ISO YYYY-MM-DD as the canonical value, render and parse using the envelope’s selected format, and replace free-text date entry with a date-aware control.

11. Field properties are not end-to-end consistent. Auto-fill cannot be added from the palette; read-only is ineffective for several control types; tooltips are not shown; attachment MIME restrictions are hardcoded; and selection, number, and appearance options are only partially editable. Implement these properties across composer, API validation, signing, and sealing, and hide any property that remains unsupported.

12. Conditional field errors are discovered too late. The editor permits conditionals without a valid parent and Review can report the envelope ready. Mirror backend field-graph validation in the composer, disable invalid choices, show precise recipient roles, and block send on every schema or graph error.

13. Autosave and publish can race or ignore failures. Full replacement saves can complete out of order, and template Publish/Use continues after a swallowed save failure. Serialize autosaves, add draft revision/ETag checks, surface conflicts, and require a confirmed current revision before publishing or using a template.

14. PDF form conversion lacks a complete review workflow. Add all eligible signing roles, show detected options/defaults/required state/data labels, explicitly identify unsupported widgets, and require confirmation before removing or flattening unsupported content.

15. Correction is incomplete for advanced recipients. The page cannot add recipients or edit witness, manager, host, and reassignment settings, and exposed role changes can fail backend validation. Build a role-aware correction composer with add/remove, relationship controls, validation, reason, and accurate change diff.

16. Document and field correction is explicitly unfinished. Permit document replacement only before any recipient completes; afterward offer clone-and-void. Allow field corrections only for incomplete recipients, increment the document/routing revision, invalidate outstanding links and saved consent where affected, audit the change, and re-notify recipients.

17. Witness handoff depends on manually copying a guest URL. Model witness mode explicitly as remote or in_person. Require an email and durable invitation for remote witnesses; keep copied links as a secondary authorized action and audit their creation.

18. Approval-only and delivery-only envelopes are blocked by the frontend. Align with backend support by allowing any actionable recipient role, skipping the field-composer requirement when no signature fields are needed, and supporting approver/certified-delivery completion paths.

19. Feature and permission gating is inconsistent. Advanced recipients use a build-time environment flag while the backend uses firm capabilities; firm scope and exports can also be displayed to unauthorized users. Replace scattered checks with the runtime E-Sign context, centralized route/action guards, and a single backend capability matrix.

### P2 — Scale and management workflows

20. Bulk Send recovery is incomplete. Add job detail, live progress, per-row envelope links, original-row error exports, corrected-file re-upload, and strict idempotent confirm/cancel/retry transitions. Cancelling must remove or explicitly retain unsent draft artifacts according to one documented policy.

21. PowerForm management exposes only part of the backend. Add scheduling windows, instructions, branding, public sender-prefill fields, submission details/retry, revoke controls, and pinned-version upgrade with a compatibility preview. Clearly state that public URLs are revealed only at creation or rotation.

22. Template management is incomplete. Let users edit roles, relationships, documents, message, date/signing settings, and branding. Add immutable published-version history and “create draft from version.” Archive templates referenced by envelopes instead of hard-deleting them.

23. Send-failed recovery is not exposed. Connect the existing retry endpoint to envelope lists/details, display error code and delivery status, and offer retry, edit, or clone-and-void actions as appropriate.

24. Envelope sharing and custody are API-only. Add a firm-user picker, grant/change/revoke access, custody transfer with retain-view choice, capability guards, confirmation, query refresh, and complete audit details.

25. Reports and exports use inconsistent filters and permissions. Use one filter contract for summary, trend, and CSV export; add the existing time-series view and drilldowns. Give standard senders export permission for their own envelopes while reserving firm-wide exports for authorized profiles.

26. The admin control plane is mostly read-only. Complete permission-profile create/clone/update/assignment; brand asset upload/edit/activation; all firm signing, reminder, date, reassignment, and feature settings; webhook edit/disable/test/secret rotation/attempts; custody remediation; and audit filtering/export. Show webhook secrets in a one-time modal rather than a transient toast.

### P3 — Security, compliance, and maintainability

27. Guest cookies fail on local HTTP. Make the Secure attribute environment/HTTPS-aware while keeping it mandatory in production; test cookie path, SameSite, expiry, and local development behavior.

28. Public endpoint rate limits are process-local. Replace security-sensitive PowerForm and guest limits with atomic PostgreSQL-backed counters keyed by IP, token hash, and email. Retain the in-memory limiter only as an optional first-line throttle.

29. Verification is described as independent but requires authentication. Keep the authenticated route for envelope metadata and add a rate-limited public file-only verifier that returns signature validity and stored-hash match without revealing envelope or recipient information.

30. Legal status claims overstate verified behavior. Replace “Met” self-certifications with scoped control descriptions and operational readiness indicators. Correct the false “no envelope delete route” assertion, document draft deletion versus sent-record retention, and require external legal/security review before making compliance claims.

31. Sealing prerequisites are checked too late. Add startup and admin readiness checks for certificate, KMS key version, expiry, storage, and task processing. In production, block sending if durable completion cannot be guaranteed and alert on seal-job age or terminal failure.

32. API contracts contain drift-prone definitions. Remove the duplicate envelope fields declaration, replace admin/report/webhook Record<string, any> responses with typed models, generate frontend types from OpenAPI, and fail CI on schema drift.

## Interface and Migration Changes

- Add stable template role IDs, envelope template provenance, optimistic draft revision, explicit witness mode/evidence, and nullable PATCH fields.
- Add durable work-item and delivery records with idempotency key, state, attempt count, next attempt, and last error; add envelope sealing/delivery summary fields for querying.
- Preserve legacy template versions through read-time index-to-role-ID normalization; do not rewrite immutable published snapshots.
- Backfill template provenance from creation audit details where possible; classify non-inferable drafts as detached templates.
- Preserve completed/sent evidence throughout migrations and archive referenced templates instead of deleting them.

## Test and Acceptance Plan

- Add PostgreSQL integration tests for transactional send, final-signature enqueue failure, email retries, PowerForm concurrency, idempotency, correction locks, and legacy template snapshots.
- Add frontend contract/component tests for every field type and property, all date formats, advanced roles, permission gating, save conflicts, and explicit setting clears.
- Add Playwright journeys for manual send, template resume, guest/account witness, approval-only envelopes, correction, Bulk Send, PowerForms, failure recovery, sealing, verification, and admin workflows.
- Add failure injection for storage, email, Cloud Tasks, KMS, and database commit boundaries; prove retries never duplicate signatures, invitations, envelopes, or submission counts.
- CI must run backend tests, frontend tests, TypeScript, lint, OpenAPI drift checks, and the production build. No release while P0 integrity scenarios fail.

## Assumptions

- The target is production-grade business E-Signature behavior with DocuSign-like workflow parity, not a legal certification.
- Sent and completed records are immutable; draft deletion remains allowed and audited.
- PostgreSQL is the durable coordination mechanism, with existing Cloud Tasks/maintenance workers executing queued work.
- Document replacement after any recipient completes is intentionally disallowed; clone-and-void is the safe recovery path.
