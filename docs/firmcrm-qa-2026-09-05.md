# FirmCRM QA — September 5, 2026

Tested the local application at `http://localhost:3000/dashboard/firmcrm` in the user's Chrome session, signed in as Local Developer in the local development firm. The dataset was empty at the start. All records created during this run are synthetic QA records.

## Fixes

| Issue reproduced | Change and verification |
| --- | --- |
| Account activity links opened `/opportunities/1` and returned 404 | Use the module's navigation component for opportunity and account links. Clicked the corrected opportunity link successfully; added a regression test for both targets. Also corrected the error boundary's dashboard destination. |
| Engagement edit showed a blank responsible partner despite an assigned administrator | Include administrators in partner selectors and retain an inherited engagement owner. Verified the saved administrator is selected; added selector regression coverage. |
| New opportunity's contact picker stayed empty after selecting an account | Pass the selected account into the contacts query, keep the form controlled, and clear the contact when the account changes. Created an opportunity with its primary contact; tested switching accounts. |
| Task entered as due September 10 displayed September 9 in Pacific time | Parse the entered date as local midnight before sending UTC. Verified September 10 on the activity feed. Dashboard task timestamps now include the UTC offset consistently with activity responses. Added frontend and backend regressions. |
| Lead funnel counted a manually created opportunity as created from a lead | Count opportunities linked to the report's lead cohort. The live report now shows one converted lead, one opportunity, and one win; direct opportunities remain in the general win/loss report. Added backend regression coverage. |
| Import history displayed UTC clock time as local time | Include the UTC offset in import timestamps. Verified the history displays 2:33/2:34 PM consistently with the audit trail; added a regression test. |
| Global search could not find a won opportunity | Request all opportunity statuses. Found and opened the won test opportunity through global search; added regression coverage. |
| Mobile opportunity filters overflowed and won/lost drop areas were cramped | Wrap filters and stack drop areas on narrow screens. Visually checked at 390×844; page and main scroll widths remained 390px. Restored the normal viewport afterward. |

## Browser workflows exercised

- Lead required-field and invalid-email validation; creation; conversion into account, contact, and opportunity.
- Opportunity creation with a selected account and primary contact; stage transition; independence clearance gate; pending match review with a resolution note; signature gate; closed won; reopening and winning again without duplicate engagements; closed lost with a recorded reason.
- Engagement register totals, external reference editing, and responsible partner display.
- Activity/task creation, due dates, completion, and recent activity history.
- Campaign creation with budget/cost, contact membership, and attendance updates with recalculated attendance rate.
- Account details and related record counts; local shared-client publication and its account-wall restriction.
- CSV account export, contact template download, contact import dry run, committed import, skipped invalid row, exception download, imported contact detail and editing.
- All seven report tabs; verified one $12,500 win, one $2,500 loss, 50% win rate, and the corrected lead funnel.
- Administration users, practice areas, pipeline stages, ethical-wall list, audit entries, and settings screen.
- Global search and command-palette focus; direct detail navigation; desktop and mobile dashboard/opportunity/form layout.

## Automated validation

- Full frontend unit suite: 345 tests passed across 73 files.
- Focused FirmCRM frontend suite: 10 tests, including five new regressions. Also run with `TZ=America/Los_Angeles` for the date regression.
- Relevant backend suite: 81 tests passed with no skips. FirmCRM source tests, integrated FirmCRM tests, shared clients, and PBC service tests. Run against a separate disposable PostgreSQL database for integrated tenant, permissions, ethical walls, lifecycle, publication, and concurrency coverage.
- TypeScript check, API type generation/OpenAPI freshness, focused FirmCRM ESLint, and `git diff --check`.
- Repository-wide ESLint passed with 558 existing warnings and no errors; focused FirmCRM ESLint had no warnings.

## Scope and retained data

Browser tests used the existing administrator session. Other roles, cross-firm access, ethical-wall enforcement, archive/restore, and destructive endpoint behavior were exercised by automated backend tests rather than changing live account access or deleting local records. Native drag-and-drop gestures, fresh-user onboarding, external outreach, and production deployment were not tested. A production build was not run.

Synthetic local records remain for review: `QA FirmCRM Lifecycle 0905`, `QA FirmCRM Audit 0905`, `QA FirmCRM Lost 0905`, `QA FirmCRM Event 0905`, their contacts/tasks, and CSV import/audit history. The original due-date reproduction task retains its old timestamp; newly created tasks use the corrected conversion. Shared-client publication was tested with the synthetic account. No messages were sent and no production data was changed.
