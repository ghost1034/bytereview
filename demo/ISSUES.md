1. **Archived Tasklytic projects appear in the PBC project selector.**
   Users can link an engagement to an inactive project; duplicate names are indistinguishable. The endpoint returns every project without checking `archived`. [pbc.py (line 356)](/Users/ianstewart/projects/bytereview/backend/routes/pbc.py:356)

   **Solution:** Exclude archived records server-side. Include workspace/client/status or a short ID in selector labels. Add an archived-project regression test.

2. **Task completion can contradict its section.**
   Moving a completed task from “Done” to “To do” leaves it completed. Section updates do not update completion. [taskActions.ts (line 630)](/Users/ianstewart/projects/bytereview/project-management/lib/taskActions.ts:630)

   **Solution:** Atomically synchronize completion when entering or leaving the canonical Done section—or visually separate workflow section from completion if independence is intentional.

3. **Quick Add can create duplicate tasks.**
   Rapid submission produced a duplicate. The dialog has no submitting guard and the button remains enabled while `createTask` is pending. [QuickAddTaskDialog.tsx (line 81)](/Users/ianstewart/projects/bytereview/project-management/features/tasks/QuickAddTaskDialog.tsx:81)

   **Solution:** Add a `busy` guard, disable all submission paths while pending, and consider a server-side idempotency key. Test rapid Enter/click submissions.

4. **“No section” inline task creation uses a synthetic section ID.**
   The UI passes `**none**` as though it were a real section ID, producing invalid/orphaned task state and no visible failure during the demo. [listUtils.ts (line 82)](/Users/ianstewart/projects/bytereview/project-management/features/views/list/listUtils.ts:82)

   **Solution:** Pass `undefined` for “No section,” validate section IDs in `createTask`, and show an error toast when inline creation fails.

5. **Engagement creation implicitly creates another project.**
   Creating an engagement always creates a same-named project, without clearly stating that behavior or allowing an existing project to be linked. This contributed to the duplicate project encountered. [MatterDialog.tsx (line 39)](/Users/ianstewart/projects/bytereview/project-management/features/psa/matters/MatterDialog.tsx:39)

   **Solution:** Offer “Create linked project” and “Link existing project,” warn on matching names, and show the linked project immediately after creation.

6. **PSA records cannot be edited through the exposed UI.**
   Client editing is implemented in the dialog but not wired into the client list/detail page; engagement editing is not implemented. This prevented assigning the newly created rate card after initial setup. [ClientsPage.tsx (line 50)](/Users/ianstewart/projects/bytereview/project-management/features/psa/ClientsPage.tsx:50), [MattersPage.tsx (line 55)](/Users/ianstewart/projects/bytereview/project-management/features/psa/MattersPage.tsx:55)

   **Solution:** Add Edit actions to client and engagement list/detail pages. Reuse `ClientDialog` for clients and extend `MatterDialog` to support editing rate cards, budgets, owners, and billing settings.

7. **PBC publish validation is too generic.**
   Publishing failed because request metadata was incomplete, but the UI did not identify the affected requests or fields. The backend already returns invalid request numbers. [pbc.py (line 484)](/Users/ianstewart/projects/bytereview/backend/routes/pbc.py:484)

   **Solution:** Parse `invalid_requests`, highlight those rows, list each missing field, and focus the first invalid request.

8. **Variance analyses use hard-coded 2025 period defaults.**
   A new 2026 analysis opened with Q3/Q4 2025 dates. Changing the comparison type to MoM did not recalculate them. The defaults are fixed in [varianceHelpers.ts (line 35)](/Users/ianstewart/projects/bytereview/lib/analytics/varianceHelpers.ts:35).

   **Solution:** For single-file uploads, infer available periods from the mapped date column and default to the latest two complete periods. At minimum, derive defaults from the current date and comparison type instead of hard-coding 2025.

9. **Variance period validation is incomplete.**
   “Continue to review” validates only the dollar and percent thresholds. It permits empty, invalid, overlapping, reversed, or completely out-of-range periods. The review screen then allows the user to run a meaningless analysis. [VarianceConfigStep.tsx (line 101)](/Users/ianstewart/projects/bytereview/components/analytics/variance/VarianceConfigStep.tsx:101)

   **Solution:** Before saving, require four valid dates, enforce `start ≤ end`, prohibit overlapping periods, and confirm each period contains at least one uploaded row. Disable “Run analysis” when validation fails and display a specific inline error.

10. **Out-of-period rows still create zero-value variance groups.**
    With 2026 source rows and 2025 period ranges, the preview reported eight groups and zero flags. The engine creates each account/department group before determining whether the row falls into either period, leaving zero-versus-zero groups. [varianceEngine.ts (line 120)](/Users/ianstewart/projects/bytereview/lib/analytics/varianceEngine.ts:120)

    **Solution:** Classify each row into base, comparison, or excluded before creating its group. Skip excluded rows. Also report counts such as “0 base rows, 0 comparison rows, 16 excluded rows” and block execution when either selected period is empty.

11. **The reconciliation rule library duplicates mapped fields.**
    The UI displayed duplicate Amount and Description sections. Normalized transactions contain canonical keys such as `amount` and `description`, while the original mapped columns `Amount` and `Description` are carried through again because exclusion is case-sensitive. [reconciliationTypes.ts (line 174)](/Users/ianstewart/projects/bytereview/lib/analytics/reconciliationTypes.ts:174)

    **Solution:** Exclude all source columns used for canonical date, description, and amount mappings from pass-through data. Normalize reference IDs into an explicit `referenceId` field, block non-useful metadata such as `Source File Path(s)`, and deduplicate rule categories case-insensitively.

12. **Reconciliation displays synthetic progress as real pass progress.**
    Matching remained on “Pass 3 of 4” for an extended period. The code confirms that the pass counter is timer-generated and intentionally stops at `N−1`; it does not reflect backend execution. [ReconciliationRulesStep.tsx (line 139)](/Users/ianstewart/projects/bytereview/components/analytics/reconciliation/ReconciliationRulesStep.tsx:139)

    **Solution:** Use an indeterminate “Matching in progress” state unless the backend streams actual pass status. Alternatively, add backend progress events and display the real completed/current pass. Avoid presenting simulated progress as accounting-engine state.

13. **Variance memos can invent dates and unsupported facts.**  
The generated memo contained a stale 2023 date and claims not supported by the source rows. The prompt omits the analysis name, client, reporting periods, generation date, and a no-fabrication rule; the response is then persisted verbatim. [analytics_ai_service.py (line 920)](/Users/ianstewart/projects/bytereview/backend/services/analytics_ai_service.py:920), [VarianceMemoTab.tsx (line 49)](/Users/ianstewart/projects/bytereview/components/analytics/variance/VarianceMemoTab.tsx:49)

   **Solution:** Supply explicit client, analysis, base/comparison periods, and as-of date. Require evidence-only statements and “not provided” when support is absent. Validate all dates, accounts, and amounts against the input before saving or exporting, and keep generated memos in a review-required draft state.

14. **Task-based time entry loses the linked engagement’s billing context.**  
Logging time from a task displayed “No rate configured” despite the engagement’s $200 rate. `TaskTimeTab` passes only the task; `usePsaContext` resolves a matter only from an explicit `matterId`, not from the project-to-matter relationship. Consequently, the matter rate card and `matterId` are omitted. [TaskTimeTab.tsx (line 63)](/Users/ianstewart/projects/bytereview/project-management/features/psa/time/TaskTimeTab.tsx:63), [usePsaContext.ts (line 20)](/Users/ianstewart/projects/bytereview/project-management/features/psa/hooks/usePsaContext.ts:20), [ManualTimeEntryDialog.tsx (line 82)](/Users/ianstewart/projects/bytereview/project-management/features/psa/time/ManualTimeEntryDialog.tsx:82)

   **Solution:** Resolve the linked matter from `projectId` when no explicit matter is supplied, preferably server-side. Persist `matterId`, `projectId`, and `clientId` on the entry and resolve the matter rate card before falling back. Require a reason for zero-rate overrides and add a task → time → invoice integration test.

15. **Timesheet approval can appear unresponsive and exposes actions the user may not be allowed to perform.**  
Approval took effect only after a delayed refresh, with no busy state, success notification, or error. The component ignores its `approverId`, shows every submitted sheet, and fires approval promises without awaiting or catching them. The backend may separately reject self-approval or routing violations. [TimeApprovalsTab.tsx (line 14)](/Users/ianstewart/projects/bytereview/project-management/features/psa/time/TimeApprovalsTab.tsx:14), [tasklytic_psa.py (line 54)](/Users/ianstewart/projects/bytereview/backend/services/tasklytic_psa.py:54)

   **Solution:** Filter or disable ineligible approvals with an explanation. Track the pending sheet, disable repeated actions, await the request, refresh status, and show success or structured error feedback. Test self-approval disabled, routed approvers, and rapid repeated clicks.

16. **Engagement-scoped invoicing excludes time logged through its linked project.**  
Selecting `Matter ENG-2026-071` produced a $0 invoice, while client-wide scope found the same two approved entries totaling $800. Matter scope compares only `entry.matterId`; it does not include entries whose `projectId` matches the matter’s linked project. The linked project is also intentionally omitted as a separate selector option. [InvoiceWizard.tsx (line 45)](/Users/ianstewart/projects/bytereview/project-management/features/psa/invoicing/InvoiceWizard.tsx:45), [InvoiceWizard.tsx (line 128)](/Users/ianstewart/projects/bytereview/project-management/features/psa/invoicing/InvoiceWizard.tsx:128)

   **Solution:** For matter scope, include entries where `matterId` matches or `projectId === matter.projectId`. Backfill missing matter context on legacy entries, label the option with both engagement number and project name, and explain why any approved entries were excluded.

17. **Invoice-period defaults and validation disagree with invoice generation.**  
The period step permits blank dates. The preview treats blanks as unbounded and can show $800, but generation replaces them with today’s date, causing historical sources to fail with HTTP 422. The wizard also permits reversed or source-empty periods. [InvoiceWizard.tsx (line 45)](/Users/ianstewart/projects/bytereview/project-management/features/psa/invoicing/InvoiceWizard.tsx:45), [InvoiceWizard.tsx (line 94)](/Users/ianstewart/projects/bytereview/project-management/features/psa/invoicing/InvoiceWizard.tsx:94), [InvoiceWizard.tsx (line 151)](/Users/ianstewart/projects/bytereview/project-management/features/psa/invoicing/InvoiceWizard.tsx:151), [tasklytic_billing.py (line 148)](/Users/ianstewart/projects/bytereview/backend/services/tasklytic_billing.py:148)

   **Solution:** Require valid start and end dates, default them from the selected sources or billing month, and use one normalized period for filtering, preview, and submission. Disable progression when the range is reversed or contains no selected sources.

18. **Structured invoice errors collapse into an opaque HTTP status.**  
The wizard displayed only `Tasklytic API /billing/invoices:generate: 422`, even though the backend returns actionable codes such as `source_outside_invoice_period`. Object-shaped details without a `message` fall back to the generic status string. [tasklyticApi.ts (line 46)](/Users/ianstewart/projects/bytereview/project-management/lib/tasklyticApi.ts:46), [tasklytic_billing.py (line 167)](/Users/ianstewart/projects/bytereview/backend/services/tasklytic_billing.py:167)

   **Solution:** Add centralized formatting for structured error codes. For this case, identify the affected entry, display its date and selected period, highlight the period fields, and preserve the raw code and request identifier for diagnostics.

19. **Invoice detail crashes after a successful status transition.**  
Submitting `INV-2048` triggered Tasklytic’s error boundary and remained broken after reload, although the invoice list confirmed that the invoice persisted as approved. Actions are fire-and-forget, and the detail renderer assumes fields such as `status` and `lineItems` are always immediately complete. [InvoiceDetailPage.tsx (line 35)](/Users/ianstewart/projects/bytereview/project-management/features/psa/invoicing/InvoiceDetailPage.tsx:35), [InvoiceDetailPage.tsx (line 43)](/Users/ianstewart/projects/bytereview/project-management/features/psa/invoicing/InvoiceDetailPage.tsx:43)

   **Solution:** Await lifecycle actions, show a pending state, refetch before rendering the new status, and catch failures locally instead of reaching the application error boundary. Validate the hydrated invoice shape and safely default optional collections. Add draft → approved transition and hard-refresh regression tests.

20. **Invoice-list status and count formatting are incomplete.**  
The list displayed raw lowercase `approved` and “1 invoices.” `STATUS_LABELS` omits `approved` and `pending_approval`, while the count is always plural. [InvoicingPage.tsx (line 18)](/Users/ianstewart/projects/bytereview/project-management/features/psa/InvoicingPage.tsx:18), [InvoicingPage.tsx (line 44)](/Users/ianstewart/projects/bytereview/project-management/features/psa/InvoicingPage.tsx:44)

   **Solution:** Use an exhaustive typed status-label map shared with invoice detail, and pluralize the count correctly. Add rendering tests for every invoice lifecycle status and zero/one/multiple invoices.
