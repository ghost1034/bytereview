# ByteReview Integration Phase

### Specification Document #4 – Front-End UX & Component Logic (Next.js 14 / React 18)

---

## 1 · Goals

- Allow **multi-source uploads** (Computer, Google Drive, Gmail) from the existing _Upload_ step with minimal clicks.
    
- Provide **multi-destination exports** (Download, Drive, Gmail) on the _Results_ page.
    
- Add an **Integrations banner/modal** for linking Google accounts and surfacing token issues.
    
- Create a standalone **Automations** section with list + wizard flows.
    
- Keep code-gen TypeScript types in sync with the new OpenAPI spec, using _TanStack React Query_ for data fetching / mutation.
    

All new UI follows the project’s design system (shadcn/ui, Tailwind CSS, framer-motion animations).

---

## 2 · Project-wide foundations

### 2.1 Libraries & patterns

|Concern|Choice|Notes|
|---|---|---|
|Data Fetching|**TanStack React Query v5**|Already used in codebase; add query retry logic aware of 202 “operations”.|
|Generated API types|**openapi-typescript** (`paths`, `operations`)|Wrap in `apiClient` w/ _zod_ validation ↔ runtime safety.|
|Component lib|**shadcn/ui**|Card, Dialog, Tabs, DropdownMenu, ToggleGroup.|
|File uploads|**@google-cloud/storage signed URL** + **Resumable.js**|Matches backend spec; 3 MB chunks; handles pause/resume.|
|Auth context|Firebase Auth → `useAuth()` hook; add `useGoogleIntegration()`.||

### 2.2 Folder structure additions

```
/components/integrations/...
/components/upload/...
/components/results/ExportDialog.tsx
/components/automations/...
/hooks/useOperationPoll.ts
```

---

## 3 · Integrations UX

### 3.1 IntegrationBanner (component)

```tsx
/**
 * Shows "Connect Google account" OR "Token expired – Reconnect".
 */
export default function IntegrationBanner({ provider = 'google' }: { provider: 'google' }) { ... }
```

- Pulls `integration_accounts` via `useQuery(['integration', provider])`.
    
- If no account or `expires_at` past, display `<Alert>` with connect/reconnect button.
    
- Button calls `/integrations/google/auth-url`, then `window.location.href = url`.
    
- On OAuth redirect success, backend sets SameSite cookie `integration_success`. Banner listens for it and refreshes query.
    

### 3.2 `useGoogleSession()` hook

Returns `{ready:boolean, scopes:string[], missingScopes:string[]}` to let components gate Drive/Gmail pickers. Caches in React Context to avoid duplicate requests.

---

## 4 · Upload page revamp

### 4.1 FileSourceTabs

```tsx
<Tabs defaultValue="computer" className="w-full">
  <Tabs.List>
    <Tabs.Trigger value="computer"><MonitorSmartphoneIcon /></Tabs.Trigger>
    <Tabs.Trigger value="gdrive"><DriveIcon /></Tabs.Trigger>
    <Tabs.Trigger value="gmail"><MailIcon /></Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="computer"><ComputerDropzone /></Tabs.Content>
  <Tabs.Content value="gdrive"><DrivePicker /></Tabs.Content>
  <Tabs.Content value="gmail"><GmailPicker /></Tabs.Content>
</Tabs>
```

Animations: framer-motion `fadeInUp`; maintain height to avoid layout shift.

#### 4.1.1 ComputerDropzone

- Uses [`react-dropzone`](https://react-dropzone.js.org/) capped at 100 files.
    
- On `onDropAccepted` call backend `/files:upload-url` then PUT to GCS URL with Resumable.js.
    
- Emits progress per file to `UploadListContext`.
    

#### 4.1.2 DrivePicker

|Implementation option|Pros|Cons|
|---|---|---|
|**A. Google _Drive Picker_ JS API** _(chosen)_|Free picker UI, supports folders, thumbnails, search.|Extra `gapi` load; client flow uses _token_ not refresh (okay – access token short-lived).|
|B. REST list in custom modal|Full control; no `iframe`.|Rebuild navigation & search; more effort.|

- Flow: request new _OAuth 2_ token **for picker scope** (`https://www.googleapis.com/auth/drive.readonly`).
    
- Receive IDs; POST to `/jobs/{id}/files:gdrive`; backend returns `operationId`.
    
- Start `useOperationPoll(opId)` until complete.
    
- Show IDs in _UploadList_ with status icons (importing, done, error).
    

#### 4.1.3 GmailPicker

MVP pattern:

1. **Server-assisted list:** GET `/gmail/attachments?limit=50` to show recent attachments as rows with checkbox.
    
2. User selects → POST `/jobs/{id}/files:gmail`.
    
3. Same `operation` polling.
    

Future: Gmail add-on or 3-pane selector, but REST list acceptable for v0.

---

## 5 · UploadList & Error handling

`UploadListTable` extends current list:

| Column      | Extra details                                                   |
| ----------- | --------------------------------------------------------------- |
| Source      | `Upload` / `Drive` / `Gmail` icon.                              |
| Status pill | “Uploading…”, “Importing…”, “Ready”, “Failed” (tailwind badge). |
| Actions     | Re-try (if failed), Delete.                                     |

_Uses React Query `useMutation` on DELETE; optimistic update._

---

## 6 · Results page – Export flow

### 6.1 ExportDialog

- Triggered by `Export` button on toolbar.
    
- Radio group → CSV / XLSX.
    
- Destination **DropdownMenu**:
    

```
• Download to computer
• Google Drive…
• Gmail…
```

For Drive/Gmail a second step appears (folder picker or email address control).

#### 6.1.1 Mutation

```ts
const { mutate: createExport } = useMutation({
  mutationFn: (body: ExportCreate) =>
    api.post(`/job-runs/${runId}/exports`, body)
});
```

On success, modal shows spinner & progress bar (operation poll).

If `destType==='download'`, receive `downloadUrl` after status `completed` → auto navigate.

---

## 7 · Automations section

### 7.1 Routes

```
/automations          – list + enable/disable toggle
/automations/new      – wizard
/automations/{id}/edit
```

Using **Next.js App Router**; each page is a server component that calls backend via React Query _inside client subcomponents_.

### 7.2 List page

_Table columns:_ Name · Trigger · Destination · Status · Last fired · Actions.  
Inline toggle uses `/PATCH automations/{id}`.

### 7.3 Wizard (3-step)

|Step|Component|Validation|
|---|---|---|
|1. Trigger|`GmailTriggerForm` (search query input + attachment type chips)|Non-empty `query`.|
|2. Job|`TemplateJobPicker` – read-only preview of job fields/files|Must select existing job.|
|3. Export|Reuse `ExportConfigForm`|Destination & file type required.|

_Wizard state in `useForm()` hook; final submit `POST /automations`._

Animations: framer-motion slide-in between steps.

---

## 8 · Operation polling hook

```ts
export function useOperationPoll(opId: string | null, opts?: { enabled?: boolean }) {
  return useQuery(
    ['operation', opId],
    () => api.get<Operation>(`/operations/${opId}`),
    {
      refetchInterval(data) {
        return data?.done ? false : 1500;  // stop when done
      },
      enabled: !!opId && opts?.enabled !== false
    }
  );
}
```

Used by uploads, imports, exports, job runs.

---

## 9 · Job History tab

_Inside Job detail page_ add secondary tab **“Runs”**.  
Fetch `/jobs/{id}/runs` → Table with:

| Run # | Started | Status | Progress | Exports | … |

Click row navigates to `/job-runs/{runId}` (re-uses Results page component but read-only).

---

## 10 · Error surfaces

|Scenario|UX reaction|
|---|---|
|Google token expired (401 on backend)|Backend returns 403 + `error.code='TOKEN_EXPIRED'` → `IntegrationBanner` auto-shows.|
|Import task failed|`UploadList` shows red icon & “Retry” selects failed file IDs and re-POSTs.|
|Vertex quota exceeded|Export flow disabled; toast “Extraction paused – we hit model quota. Please try later.” (backend conveys error).|

Toast system: `sonner` minimal.

---

## 11 · Accessibility & i18n

- All icons include `aria-label`.
    
- Keyboard navigation for Tabs, List rows.
    
- Text strings wrapped with `next-intl`; new keys added under `en.json`.
    

---

## 12 · Testing

|Layer|Tool|Tests|
|---|---|---|
|Unit|Vitest + React Testing Library|`DrivePicker` opens & returns IDs mock.|
|Integration (CI)|Cypress Component|Upload local PDF → expect list row → run extraction (mock) → export download.|
|E2E (staging)|Playwright Cloud|OAuth flow with Google test account using _puppeteer-extra-plugin-stealth_ to bypass consent.|

---

## 13 · Performance considerations

- Lazy-load Drive/Gmail pickers (`dynamic(() => import(...), { ssr: false })`).
    
- Debounce Gmail search query input (500 ms).
    
- Use `react-window` for attachment list scrolling > 200 rows.
    
- Signed-URL uploads bypass Next.js API routes to avoid double hop.
    

---

## 14 · Alternatives considered

|Topic|Option A (chosen)|Option B|
|---|---|---|
|Export UX|Modal dialog|Side drawer|
|Automations wizard|Multi-step wizard|Single long form with accordions|
|State lib|Keep **React Query + Context**|Adopt Redux Toolkit|

---

## 15 · Dev hand-off checklist

1. Merge Figma frames → “Integrations-v1” page for designer spec.
    
2. Stub all new API hooks returning mock data behind `INTEGRATIONS_PHASE` env flag.
    
3. Confirm `openapi-typescript` code-gen passes CI.
    
4. Write Storybook stories for:
    
    - `IntegrationBanner` (connected / disconnected / expired)
        
    - `FileSourceTabs` w/ each picker
        
    - `ExportDialog` success / error
        

---
