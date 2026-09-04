# FirmCRM

CRM for accounting, law, and other professional-services firms. The object model follows Salesforce / HubSpot
(Lead → Account + Contact + Opportunity → pipeline → reports) and adds what generic CRMs miss for firms:

| Firm need | How FirmCRM handles it |
|---|---|
| Conflict of interest (legal) | Practice areas flagged `clearance_type=conflict` require a **conflict check** before Closed Won. Search covers account names, aliases, contacts, and adverse parties recorded on past opportunities/engagements. Matches route to manager review; waivers require a partner and a documented basis. |
| Independence (attest) | Practice areas flagged `independence` require an **independence check** with an engagement-team attestation; any disclosed relationship routes to partner review. |
| Engagement letter | Closed Won is blocked until the engagement letter is marked **signed**. |
| Origination credit | Every opportunity and account carries an **originating partner** and **responsible partner**; Reports → Origination credit. |
| Referral sources | Opportunities record **referred-by** (contact or account); Reports → Referral sources ranks who sends work. |
| Won work | Closed Won auto-creates an **Engagement** (the matter), flips the account to *client*, and stamps `client_since`. Engagements carry an `external_ref` for the PSA / practice-management hand-off. |
| Adverse parties | Stored on opportunities and engagements; fed into every later conflict search. |
| Campaigns | Events / webinars / newsletters with members, attendance, lead attribution, influenced pipeline, won amount, ROI. |
| **Ethical walls** | Partners raise a wall on an account or matter; non-members cannot see it (404), it vanishes from lists and exports, and conflict search shows it only as a restricted matter. |
| Audit trail | Every create / update / stage change / clearance decision / wall action is written to `audit_log` with before/after images. |

## Run (development)

```bash
make setup      # uv venv + pip install, npm install
make seed       # migrate + load demo firm (10 users, 24 accounts, 39 opportunities, 2 pending clearances)
make backend    # migrate, then FastAPI on :8010 (docs at /api/docs)
make frontend   # Vite on :5180 (proxies /api → :8010)
make test       # pytest with coverage floor (85%)
make ci         # every CI gate locally (the GitHub Enterprise host has no Actions runner)
```

Demo logins (password `Demo1234!Demo`): `admin@demo.firm`, `partner.lit@demo.firm`, `partner.audit@demo.firm`,
`partner.tax@demo.firm`, `partner.corp@demo.firm`, `manager@demo.firm`, `staff@demo.firm`, `marketing@demo.firm`.

## Run (production shape)

```bash
cp .env.production.example .env     # set SECRET_KEY, POSTGRES_PASSWORD, CORS_ORIGINS
make up                              # Postgres 16 + API (migrates on start) + nginx SPA on :8080
curl -fsS localhost:8080/api/ready   # {"status":"ready",...}
make seed-docker                     # optional demo data (never in real production)
make backup                          # pg_dump to ./backups
```

See `docs/RUNBOOK.md` (deploy, probes, backup/restore, secret rotation, scaling, incidents),
`docs/SECURITY.md` (auth, RBAC matrix, data protection, known gaps) and `docs/DATA_MODEL.md`.

## Design system

The UI follows `design/proposals/finance/DESIGN.md` ("finance-grade editorial": Stripe/Mercury lineage — warm paper
canvas, Geist with tabular numerals, hairline tables, semantic color only). Tokens live in `frontend/src/index.css`
(`sand-*`, `accent-*`, `success/warn/danger/info-*`); primitives in `frontend/src/components/ui/`. Two alternative
directions (`linear`, `precision`) were produced and kept for reference. Anti-patterns to avoid are listed in §8 of
the spec — read it before adding UI.

## Roles

| Role | Can |
|---|---|
| staff / marketing | create & edit leads, accounts, contacts, opportunities, activities, campaigns; run checks |
| manager | + resolve clearance checks (clear / conflict), delete records, reopen opportunities, edit engagements, view audit log |
| partner | + **waive** a conflict |
| admin | + users, practice areas, pipeline stages |

## Structure

```
backend/app
  models.py          SQLAlchemy models (User, PracticeArea, Pipeline/Stage, Account, Contact, Lead, Opportunity,
                     StageHistory, Activity, ConflictCheck, Engagement, Campaign/Member, AuditLog)
  schemas.py         Pydantic I/O
  services/          conflicts (fuzzy search + self-match filter), opportunities (stage gate, won side-effects),
                     leads (convert), reports (aggregates)
  api/               one router per object + reports + admin
  seed.py            deterministic demo firm
frontend/src
  api/               typed client
  components/ui      Button/Input/Modal/Badge/DataTable/SchemaForm (schema-driven create+edit forms)
  pages/             Dashboard, Leads, Accounts(+detail), Contacts(+detail), Opportunities (Kanban + table, +detail),
                     Clearance, Engagements, Campaigns, Tasks, Reports, Admin
```

## Production status and remaining gaps

Implemented: Alembic migrations, Postgres, rotating refresh tokens + lockout + rate limiting + password policy,
strict validation, pagination, archive instead of delete, duplicate guards, CSV import/export with exception
reports, JSON logs, readiness probe, security headers, 96% test coverage on two database engines, Docker/compose,
CI. Details in `CHANGELOG.md`.

Also implemented: ethical walls (record-level visibility) and Redis-shared rate limiting.

Not yet implemented (see `docs/SECURITY.md` → Known gaps): SSO/OIDC and MFA, trigram-indexed conflict search at very
large scale, email/calendar capture, e-signature for engagement letters, PSA/billing integration beyond
`Engagement.external_ref`. Origination figures use estimated fees at close — reconcile to billed fees before use
in compensation.
