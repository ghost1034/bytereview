# Feedback rewards

The shared dashboard header has a Feedback button. Signed-in users can submit up
to 5,000 characters. Submissions and their reward outcomes are saved in
`feedback_submissions`, available in Admin → Platform or the database explorer.

An account can earn one reward per billing month. Further submissions are saved
without another reward, and the dialog shows the next eligible date. Request IDs
make retries idempotent; account row locks serialize rewards with usage writes
and subscription changes.

- Free accounts receive Basic access immediately for one calendar month from
  submission (dates at month-end clamp to the next month's last day). This month
  becomes their usage period and next reward date. The included Basic page,
  token, automation, and storage allowances apply. No Stripe subscription or
  payment method is created. Pages and tokens are capped at the Basic allowance;
  token operations already in flight may cross the token limit. Access returns
  to Free automatically at expiry, unless the user buys a paid subscription.
- Paid accounts keep their plan and billing dates. Their current-period page and
  token counters reset to zero, and the product breakdown starts at the reset.
  Stored documents, storage reservations, and configured automations are
  unchanged. The next reward is available at the current billing period's end.
- Usage history is retained. Paid resets append zero-usage credit rows with
  negative `stripe_quantity` values for previously billable pages/tokens in the
  open period. The existing Stripe usage reconciliation worker reports these
  using stable event identifiers. Pending/failed original usage is included;
  shadow and complimentary usage are excluded. This resets the open period's
  meters without changing subscription fees or refunding finalized invoices.
  Stripe aggregation is asynchronous. See [Stripe's meter event documentation](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api).

Deploy migration `080_feedback_rewards`, then update the workers before enabling
the updated API/frontend. Older workers do not understand `stripe_quantity`
credits and must not process reward events. Continue running the existing Stripe usage reconciliation worker so credits are
reported promptly. No new configuration or scheduled jobs are required.

Verification:

```sh
FEEDBACK_TEST_DATABASE_URL=postgresql://localhost/feedback_test backend/.venv/bin/python -m pytest backend/tests/test_feedback.py backend/tests/test_billing_service.py backend/tests/test_billing_routes.py backend/tests/test_pbc_storage.py -q
npx vitest run --config vitest.feedback-browser.config.ts
npm run type-check
npm run check:openapi
```

The PostgreSQL tests create and drop isolated schemas. Browser tests use an
installed Google Chrome and cover validation, errors/retries, reward messages,
and mobile layout; screenshots are written to `tmp/cpa-feedback-*.png`.
