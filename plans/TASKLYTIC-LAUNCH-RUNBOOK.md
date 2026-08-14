# Tasklytic Milestone C launch runbook

Production deployment is human-owned. Complete each checkpoint in order and
attach the command output, operator, UTC timestamp, and deployment revision to
the change record.

## Migration rehearsal

1. Restore the latest scrubbed production snapshot into an isolated PostgreSQL
   rehearsal database.
2. Run `backend/.venv/bin/alembic upgrade head`; confirm head is
   `072_tasklytic_phase10` and capture row counts for Tasklytic
   workspaces, entity records, commands, payments, and trust transactions.
3. Exercise bootstrap and one read-only report per rehearsal workspace. Compare
   the captured counts and invoice/trust totals to the pre-migration snapshot.
4. Generate downgrade SQL for review only. The production rollback is an
   application rollback with the additive tables retained; do not downgrade or
   delete accounting records.

## Capability enablement

Enable `gcs`, `gmail`, `vertex_receipts`, `google_drive`, then
`stripe_connect`, one workspace cohort at a time. Verify `/integrations/capabilities`
after each step. Workspace-plan Stripe uses `/api/stripe` and `STRIPE_WEBHOOK_SECRET`;
client invoices use `/api/tasklytic/integrations/stripe-connect/webhook` and the
separate `TASKLYTIC_STRIPE_CONNECT_WEBHOOK_SECRET`.

## Monitoring verification

Confirm command retry/exhaustion alerts, integration connection degradation,
webhook `failed` receipts, external-reference conflicts, Gmail failures, and
Google/Vertex/Stripe error rates are visible. Send one sandbox Drive import,
receipt extraction, email, and client invoice payment; replay the payment event
and confirm one local payment.

## Rollback validation

Disable capability records first, roll back the application revision, and
leave additive Phase 10 tables intact. Confirm the predecessor application can
bootstrap, read invoices/payments/trust, and download existing GCS objects.
Re-enable only after retry queues and failed webhook receipts are reconciled.
