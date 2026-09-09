# FirmCRM

FirmCRM is a native CPAAutomation module at `/dashboard/firmcrm`, backed by `/api/firmcrm`. It uses platform Firebase authentication, firm onboarding, PostgreSQL, React Query, dashboard navigation, and deployment. Firm membership is required; an Analytics subscription is not.

The imported `firmcrm/` directory remains reference material. Production code lives in `backend/firmcrm`, `components/firmcrm`, and `app/dashboard/firmcrm`. The reference folder is excluded from root TypeScript, ESLint, and Docker context. No source credentials, demo identities, or demo business records are provisioned. Synthetic source fixtures exist only under `backend/tests/firmcrm_source`.

## Data and access

- Migration `079_firmcrm_module` adds prefixed tables to the existing Alembic chain. Business record IDs remain integers. Firms use platform UUIDs and members use Firebase UIDs.
- Each firm initializes once with ten practice areas and the seven-stage Standard Pursuit pipeline. Its settings default to USD, 21 stale days, a 0.82 conflict-match threshold, and administrator wall bypass.
- CRM roles are independent of Analytics roles. Platform firm administrators have effective CRM administrator access; other members begin as staff. CRM administrators assign staff, marketing, manager, partner, or administrator roles to existing members. Identity creation and invitations remain platform operations.
- FirmCRM Administration opens the shared Firm management panel: the same firm ID, invitation code, directory, and platform Admin/User controls used by AI Analytics Suite. Members joining with that code also appear in FirmCRM, Tasklytic, and PBC. Only platform firm administrators can generate codes or change platform roles; a CRM-only administrator does not gain those permissions. The Users tab retains CRM-specific roles and access. Settings contains CRM business rules.
- Staff and marketing can maintain ordinary CRM records. Managers can import/export, archive, and perform ordinary clearance decisions. Partner privileges include waivers, disclosed independence decisions, reopening, and ethical-wall management. Reference settings and member-role administration require CRM administrator access. Individual endpoints retain the source role restrictions.
- `CrmSession` requires authenticated firm context and applies tenant and ethical-wall predicates to ORM reads, relationships, counts, reports, exports, and audit subjects. Writes validate ownership, referenced records, and assigned platform users. Restricted records return 404. Removed or moved firm members cannot use their retained CRM profiles.
- Account walls cover contacts, opportunities, engagements, activities, converted leads, and related audit history. Opportunity walls restrict their own descendants. Conflict searches can see same-firm restricted candidates internally, but response matches redact their names, identifiers, and matter context.
- Historical CSV uploads contain unstructured row data that cannot safely be attributed to individual matters. Import history, exception downloads, and file-level audit entries are withheld from actors with any inaccessible matters. They remain available to actors who can see the full firm dataset. Current CSV record exports always follow the actor's visibility.
- CRM writes serialize on the firm row. This intentionally favors correct conversion, publication, and wall behavior over concurrent write throughput. Engagement uniqueness and active-wall uniqueness are also enforced in PostgreSQL. Reopening and winning again reuses the existing engagement.

## Conflict companies and clearance

In **FirmCRM → Clearance**, use **Add conflict company** to save a company name, comma-separated aliases, and conflict reason / notes. The **Conflict companies** tab lists and edits these records, including archived entries, with search and pagination. They use the existing adverse-party account type and appear in Accounts as well. For an existing account, edit its Type to Adverse Party instead of creating a duplicate. No migration or API contract change is required.

Recorded checks and ad-hoc searches screen these companies alongside other accounts, contacts, and adverse parties on opportunities and engagements. A match on a recorded check produces **Pending review**, requiring a reviewer decision. An adverse-party account remains a match even when checking that account itself or its opportunity; ordinary prospect self-matches are still excluded. Archived companies remain searchable, and firm boundaries and ethical-wall redaction still apply. Changes affect new checks; rerun clearance after maintaining the list because historical decisions are retained.

## Shared clients

Accounts remain CRM-only until a manager or higher explicitly links or publishes them. The actor must also have the platform's shared-client write permission. Matching is selectable and same-firm; names never trigger an automatic merge.

Publication previews name, industry, and an optional selected contact's name, email, and phone. Contact details are copied once. Notes, opportunities, adverse parties, clearance data, and engagements are never published. Creation and linking are transactional and repeated submissions return the established link.

The shared client's name and industry are authoritative after linking, including updates made by other modules. CRM reads overlay those canonical values and CRM edits update them transactionally with platform write authorization. All other CRM fields stay local.

Links are permanent in v1. An account with an active wall cannot be linked, and a linked account cannot receive an account wall. Opportunity walls remain available. Archival, reopening, or winning never deletes the shared client. Both platform client-deletion paths return an actionable conflict for linked clients. Firm purge removes CRM dependents before shared clients; firm exports include CRM records under the requesting actor's visibility.

## Frontend and contracts

Every retained screen has a native App Router route, including direct account, contact, and opportunity links. CRM navigation sits inside the shared dashboard shell. The shared command-palette callback focuses module search. Platform account controls handle sign-in and sign-out.

The source theme uses namespaced `crm-*` Tailwind utilities and scoped `.firmcrm-root` CSS in the existing Tailwind 3/PostCSS pipeline. There is one React runtime and one stylesheet pipeline. Dialogs stay inside the theme boundary. Dense tables and the horizontally scrolling board are retained, while detail panels and metrics stack on small screens.

Query keys include module, Firebase UID, and firm UUID. Mutations invalidate the active module cache; context refreshes every 30 seconds and on focus. Role, settings, and wall revision changes reset cached queries. The server checks membership and permissions on every request independently of this UI refresh. API errors retain domain codes and structured validation errors. Downloads carry platform authentication. Contracts are generated into `lib/api-types.ts` from `backend/openapi.json`.

Shared firm creation, joining, profile changes, and member changes also invalidate the current user's CRM context and records, so firm management refreshes CRM permissions and member pickers. This UI integration reuses the existing firm APIs and schema; it requires no migration or new API contracts.

## Verification

From the repository root:

```sh
backend/.venv/bin/python -m pytest backend/tests/firmcrm_source backend/tests/test_firmcrm.py backend/tests/test_shared_clients.py backend/tests/test_pbc_service.py -q
npm run generate-types
npm run check:openapi
npm run type-check
npm run lint
npm run test:unit
npm run build
```

To exercise PostgreSQL locking/concurrency, set `FIRMCRM_TEST_DATABASE_URL` to a **disposable PostgreSQL database** before running `backend/tests/test_firmcrm.py`. The fixture creates and drops a unique schema per test. SQLite runs skip the concurrency test. Do not point this at production.

Browser checks cover onboarding, account creation and validation, permanent publication, opportunity stage changes and signature gating, search, direct links, authenticated CSV downloads, and desktop/mobile layout. The source visual references are under `firmcrm/design/reviews/shots`.

## Release and rollback

1. Back up the target database using the existing release process.
2. Deploy the additive schema with `alembic upgrade head` from `backend/` before releasing the application. No new service or module-specific environment variable is required. The port supports the existing Python 3.11 runtime.
3. Release the API and Next.js application through the existing deployment infrastructure. Verify `/api/firmcrm/context`, initial defaults, the module launcher, a record mutation, and an authenticated download with a test firm.
4. Use existing logs to inspect failures. CRM domain rejection logs include firm/user identifiers and error codes without CRM payloads.

For application rollback, revert the application release while retaining the additive CRM tables and data. Do not downgrade migration 079 on a populated deployment. Before rolling back the shared-client deletion/purge guards, suspend those destructive administrative operations for firms with linked CRM data.

This release has no production-data import, automatic outreach, suite-wide walls, separate CRM service, or downstream E-Signature/Tasklytic/PBC workflow automation. Engagement-letter status is manually recorded; reporting amounts remain estimated fees.
