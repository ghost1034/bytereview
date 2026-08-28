import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "@/taxatlas-ui/lib/navigation";
import { api } from "@/taxatlas-ui/lib/api";
import { useAuth } from "@/taxatlas-ui/lib/auth";
import type { ApiKeyCreated, DeliveryChannelCreated, DeliveryChannelOut, DeliveryDigest, DeliveryKind, DeliveryTestResult } from "@/taxatlas-ui/lib/types";
import { CHANGE_TYPES, TAX_TYPES, TAX_TYPE_LABEL } from "@/taxatlas-ui/lib/enums";
import { fmtDateTime, fmtInt, relTime } from "@/taxatlas-ui/lib/format";
import { useRateLimit } from "@/taxatlas-ui/hooks/useRateLimit";
import { usePageTitle } from "@/taxatlas-ui/hooks/usePageTitle";
import { EntityFormDrawer, type FormValues } from "@/taxatlas-ui/components/admin/EntityFormDrawer";
import { Page, PageHeader } from "@/taxatlas-ui/components/layout/Page";
import { Tabs } from "@/taxatlas-ui/components/ui/Tabs";
import { Button } from "@/taxatlas-ui/components/ui/Button";
import { Checkbox, Field, Input, Select, Toggle } from "@/taxatlas-ui/components/ui/Fields";
import { StatusMark } from "@/taxatlas-ui/components/ui/Marker";
import { JurisdictionRef } from "@/taxatlas-ui/components/ui/JurisdictionRef";
import { TaxTypeText } from "@/taxatlas-ui/components/ui/Chips";
import { CodeBlock } from "@/taxatlas-ui/components/ui/CodeBlock";
import { KV } from "@/taxatlas-ui/components/ui/Drawer";
import { TableSkeleton } from "@/taxatlas-ui/components/ui/Skeleton";
import { EmptyState, ErrorState } from "@/taxatlas-ui/components/ui/EmptyState";
import { useToast } from "@/taxatlas-ui/components/ui/Toast";
import { ChangeRow } from "@/taxatlas-ui/components/ChangeRow";

type Tab = "keys" | "watchlist" | "notifications" | "delivery" | "quickstart" | "about";
const TABS: Tab[] = ["keys", "watchlist", "notifications", "delivery", "quickstart", "about"];

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "integrated";

export default function AccountPage() {
  usePageTitle("Account");
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tabParam = sp.get("tab");
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "keys";
  const setTab = (t: Tab) => setSp({ tab: t }, { replace: true });
  const watch = useQuery({ queryKey: ["watchlist"], queryFn: api.account.watchlist });
  const unread = useQuery({ queryKey: ["notifications", "unread"], queryFn: () => api.account.notifications(true) });

  return (
    <Page>
      <PageHeader
        title="Account"
        subtitle={
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-ink-2">{user?.full_name}</span>
            <span aria-hidden="true">·</span>
            <span className="mono text-ink-2">{user?.email}</span>
            <span aria-hidden="true">·</span>
            <span className="text-ink-2">{user?.role}</span>
            <span aria-hidden="true">·</span>
            <span className="text-ink-3">CPAAutomation account</span>
            {user?.organization && (
              <>
                <span aria-hidden="true">·</span>
                <span>{user.organization}</span>
              </>
            )}
          </span>
        }
      />
      <div className="region overflow-hidden">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          ariaLabel="Account sections"
          tabs={[
            { key: "keys", label: "API keys" },
            { key: "watchlist", label: "Watchlist", count: watch.data?.length },
            { key: "notifications", label: "Notifications", count: unread.data?.length },
            { key: "delivery", label: "Delivery" },
            { key: "quickstart", label: "API quickstart" },
            { key: "about", label: "About" },
          ]}
        />
        {tab === "keys" && <KeysTab />}
        {tab === "watchlist" && <WatchlistTab />}
        {tab === "notifications" && <NotificationsTab />}
        {tab === "delivery" && <DeliveryTab />}
        {tab === "quickstart" && <QuickstartTab />}
        {tab === "about" && <AboutTab />}
      </div>
    </Page>
  );
}

/** Inline form row above a table (hairline below). */
function Toolbar({ children, ariaLabel, onSubmit }: { children: React.ReactNode; ariaLabel?: string; onSubmit?: (e: FormEvent) => void }) {
  const cls = "flex flex-wrap items-end gap-3 border-b border-hairline px-4 py-3";
  if (onSubmit)
    return (
      <form onSubmit={onSubmit} className={cls} aria-label={ariaLabel}>
        {children}
      </form>
    );
  return <div className={cls}>{children}</div>;
}

/* ------------------------------------------------------------------ API keys */

function KeysTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const { isAdmin } = useAuth();
  const rl = useRateLimit();
  const [name, setName] = useState("");
  const [adminScope, setAdminScope] = useState(false);
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: api.account.keys });
  const create = useMutation({
    mutationFn: (n: string) => api.account.createKey(n, isAdmin && adminScope ? ["read", "admin"] : ["read"]),
    onSuccess: (k) => {
      setCreated(k);
      setName("");
      setAdminScope(false);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast.error(e),
  });
  const revoke = useMutation({
    mutationFn: (id: number) => api.account.revokeKey(id),
    onSuccess: (_m, id) => {
      toast.success("Key revoked");
      // The one-time plaintext banner must not keep advertising a key that no longer works.
      setCreated((c) => (c && c.id === id ? null : c));
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (e) => toast.error(e),
  });
  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  };
  const defaultLimit = keys.data?.[0]?.rate_limit_per_minute;
  const active = keys.data?.filter((k) => !k.revoked_at).length ?? 0;

  return (
    <div>
      <Toolbar onSubmit={onCreate} ariaLabel="Create key form">
        <Field label="New key name" className="w-[240px]">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ci-pipeline" maxLength={100} />
        </Field>
        {isAdmin && (
          <Checkbox checked={adminScope} onChange={setAdminScope} className="h-7">
            <span title="Grants the key access to /admin write endpoints. Only available to admin users.">Admin scope</span>
          </Checkbox>
        )}
        <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim()}>
          Create key
        </Button>
        <span className="ml-auto text-right text-xs text-ink-3">
          <span className="mono text-ink-2">{active}</span> of <span className="mono text-ink-2">10</span> active · new keys are read-only{isAdmin ? " unless admin scope is granted" : ""} ·{" "}
          <span className="mono text-ink-2">{fmtInt(defaultLimit)}</span> req/min default
          {rl.limit != null && (
            <>
              <br />
              This session: <span className="mono text-ink-2">{rl.remaining}</span>/<span className="mono text-ink-2">{rl.limit}</span> requests remaining
              {rl.resetSeconds != null && (
                <>
                  {" "}
                  · resets in <span className="mono text-ink-2">{rl.resetSeconds} s</span>
                </>
              )}
            </>
          )}
        </span>
      </Toolbar>
      {created && (
        <div className="border-b border-hairline bg-accent-soft px-4 py-3" role="region" aria-label="New API key">
          <div className="mb-2 flex items-baseline gap-3">
            <p className="text-sm text-ink-1">
              New key &quot;{created.name}&quot; is shown once — copy it now; it cannot be retrieved later.
            </p>
            <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setCreated(null)}>
              Dismiss
            </Button>
          </div>
          <CodeBlock label="api key" code={created.key} />
          <p className="mt-2 text-xs text-ink-3">
            Send it as <span className="mono text-ink-2">X-API-Key</span> on every request.
          </p>
        </div>
      )}
      {keys.isLoading ? (
        <TableSkeleton cols={6} rows={3} />
      ) : keys.isError ? (
        <ErrorState error={keys.error} onRetry={() => keys.refetch()} what="API keys" />
      ) : keys.data && keys.data.length === 0 ? (
        <EmptyState title="No API keys yet." hint="Create one above to call the API programmatically." />
      ) : (
        <table className="tbl" aria-label="API keys">
          <thead>
            <tr>
              <th>Name</th>
              <th>Prefix</th>
              <th>Scopes</th>
              <th className="num">Rate limit</th>
              <th className="num">Requests</th>
              <th>Last used</th>
              <th>Created</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {keys.data?.map((k) => (
              <tr key={k.id} className={k.revoked_at ? "opacity-50" : undefined}>
                <td>{k.name}</td>
                <td className="code">{k.prefix}…</td>
                <td className="text-ink-2">{(k.scopes ?? []).join(", ") || "read"}</td>
                <td className="num">
                  {k.rate_limit_per_minute}
                  <span className="unit">/min</span>
                </td>
                <td className="num">{fmtInt(k.request_count)}</td>
                <td className="date" title={relTime(k.last_used_at)}>
                  {fmtDateTime(k.last_used_at)}
                </td>
                <td className="date">{fmtDateTime(k.created_at)}</td>
                <td>{k.revoked_at ? <StatusMark value="revoked" tone="negative" /> : <StatusMark value="active" />}</td>
                <td className="text-right">
                  {!k.revoked_at && (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={revoke.isPending && revoke.variables === k.id}
                      onClick={() => {
                        if (window.confirm(`Revoke key "${k.name}"? Clients using it will start receiving 401s.`)) revoke.mutate(k.id);
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Watchlist */

function WatchlistTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [taxType, setTaxType] = useState("");
  const [children, setChildren] = useState(true);
  const list = useQuery({ queryKey: ["watchlist"], queryFn: api.account.watchlist });
  const add = useMutation({
    mutationFn: () => api.account.addWatch({ jurisdiction_code: code.trim().toUpperCase() || null, tax_type: taxType || null, include_children: children }),
    onSuccess: () => {
      toast.success("Added to watchlist");
      setCode("");
      setTaxType("");
      qc.invalidateQueries({ queryKey: ["watchlist"] });
    },
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.account.removeWatch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watchlist"] }),
    onError: (e) => toast.error(e),
  });
  return (
    <div>
      <Toolbar
        ariaLabel="Watchlist form"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim() || taxType) add.mutate();
        }}
      >
        <Field label="Jurisdiction code">
          <Input className="mono w-[120px] uppercase" placeholder="DE or US-CA" value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="Tax type">
          <Select className="w-[190px]" placeholder="Any tax type" value={taxType} onChange={(e) => setTaxType(e.target.value)} options={TAX_TYPES.map((t) => ({ value: t, label: TAX_TYPE_LABEL[t] }))} />
        </Field>
        <Checkbox checked={children} onChange={setChildren} className="h-7">
          include sub-jurisdictions
        </Checkbox>
        <Button type="submit" variant="primary" loading={add.isPending} disabled={!code.trim() && !taxType}>
          Watch
        </Button>
        <span className="ml-auto text-xs text-ink-3">Matching change events create notifications and feed your delivery channels.</span>
      </Toolbar>
      {list.isLoading ? (
        <TableSkeleton cols={4} rows={3} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} what="watchlist" />
      ) : list.data && list.data.length === 0 ? (
        <EmptyState title="Nothing watched yet." hint="Watch a jurisdiction, a tax type, or both to be notified of detected changes." />
      ) : (
        <table className="tbl" aria-label="Watchlist">
          <thead>
            <tr>
              <th>Jurisdiction</th>
              <th>Tax type</th>
              <th>Sub-jurisdictions</th>
              <th>Added</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((w) => (
              <tr key={w.id}>
                <td>{w.jurisdiction_code ? <JurisdictionRef code={w.jurisdiction_code} name={w.jurisdiction_name} /> : <span className="text-ink-3">All jurisdictions</span>}</td>
                <td>{w.tax_type ? <TaxTypeText value={w.tax_type} /> : <span className="text-ink-3">All tax types</span>}</td>
                <td className="text-ink-2">{w.include_children ? "included" : "excluded"}</td>
                <td className="date">{fmtDateTime(w.created_at)}</td>
                <td className="text-right">
                  <Button size="sm" variant="danger" onClick={() => remove.mutate(w.id)} loading={remove.isPending && remove.variables === w.id}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Notifications */

function NotificationsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(true);
  const list = useQuery({ queryKey: ["notifications", unreadOnly ? "unread" : "all"], queryFn: () => api.account.notifications(unreadOnly) });
  const readAll = useMutation({
    mutationFn: api.account.readAll,
    onSuccess: () => {
      toast.success("All notifications marked read");
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e) => toast.error(e),
  });
  const readOne = useMutation({
    mutationFn: (id: number) => api.account.readOne(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e) => toast.error(e),
  });
  return (
    <div>
      <div className="flex items-center gap-4 border-b border-hairline px-4 py-2.5">
        <Checkbox checked={unreadOnly} onChange={setUnreadOnly}>
          unread only
        </Checkbox>
        <span className="text-xs text-ink-3">{list.data ? <><span className="mono text-ink-2">{list.data.length}</span> shown</> : ""}</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => readAll.mutate()} loading={readAll.isPending} disabled={!list.data?.some((n) => !n.read_at)}>
          Mark all read
        </Button>
      </div>
      {list.isLoading ? (
        <TableSkeleton cols={3} rows={4} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} what="notifications" />
      ) : list.data && list.data.length === 0 ? (
        <EmptyState title={unreadOnly ? "No unread notifications." : "No notifications yet."} hint="Notifications are generated from change events matching your watchlist." />
      ) : (
        <ul className="flex flex-col">
          {list.data?.map((n) => (
            <li key={n.id} className={`flex items-start ${n.read_at ? "" : "shadow-[inset_2px_0_0_var(--accent)]"}`}>
              <div className="min-w-0 flex-1">
                <ChangeRow c={n.change_event} />
              </div>
              {!n.read_at && (
                <Button size="xs" variant="ghost" className="mt-2 mr-3 shrink-0" onClick={() => readOne.mutate(n.id)} loading={readOne.isPending && readOne.variables === n.id} aria-label="Mark notification read" title="Mark read">
                  Mark read
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Delivery */

const DELIVERY_FILTER_FIELDS = [
  { key: "target", label: "Target", type: "text" as const, required: true, help: "Email address or HTTPS webhook URL" },
  { key: "digest", label: "Digest", type: "select" as const, half: true, options: [{ value: "instant", label: "Instant" }, { value: "daily", label: "Daily digest" }] },
  { key: "tax_types", label: "Tax types filter", type: "tags" as const, placeholder: "vat, corporate_income (blank = all)", help: "Comma-separated enum values" },
  { key: "jurisdiction_codes", label: "Jurisdiction filter", type: "tags" as const, placeholder: "DE, US-CA (blank = all)" },
  { key: "change_types", label: "Change types filter", type: "tags" as const, placeholder: CHANGE_TYPES.join(", ") },
];

function filtersSummary(f: DeliveryChannelOut["filters"]): string {
  if (!f) return "All changes";
  const parts: string[] = [];
  if (f.tax_types?.length) parts.push(`tax: ${f.tax_types.join(", ")}`);
  if (f.jurisdiction_codes?.length) parts.push(`juris: ${f.jurisdiction_codes.join(", ")}`);
  if (f.change_types?.length) parts.push(`types: ${f.change_types.join(", ")}`);
  return parts.length ? parts.join(" · ") : "All changes";
}

const VERIFY_SNIPPET = `# header: X-TaxAtlas-Signature: sha256=<hex>
expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
hmac.compare_digest(expected, request.headers["X-TaxAtlas-Signature"])  # compare over the RAW request body`;

function DeliveryTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<DeliveryKind>("webhook");
  const [target, setTarget] = useState("");
  const [digest, setDigest] = useState<DeliveryDigest>("instant");
  const [created, setCreated] = useState<DeliveryChannelCreated | null>(null);
  const [editing, setEditing] = useState<DeliveryChannelOut | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, DeliveryTestResult>>({});

  const list = useQuery({ queryKey: ["delivery"], queryFn: api.delivery.list });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["delivery"] });
  const create = useMutation({
    mutationFn: () => api.delivery.create({ kind, target: target.trim(), digest }),
    onSuccess: (c) => {
      setCreated(c);
      setTarget("");
      toast.success("Channel added", c.kind === "webhook" ? "Copy the signing secret now — it is shown once." : undefined);
      invalidate();
    },
    onError: (e) => toast.error(e),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof api.delivery.patch>[1] }) => api.delivery.patch(id, body),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delivery.remove(id),
    onSuccess: (_m, id) => {
      toast.success("Channel deleted");
      // Drop the one-time secret banner, cached test result and expanded attempts of a channel that no longer exists.
      setCreated((c) => (c && c.id === id ? null : c));
      setTestResults((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      if (expanded === id) setExpanded(null);
      invalidate();
    },
    onError: (e) => toast.error(e),
  });
  const test = useMutation({
    mutationFn: (id: number) => api.delivery.test(id),
    onSuccess: (r, id) => {
      setTestResults((m) => ({ ...m, [id]: r }));
      invalidate();
    },
    onError: (e) => toast.error(e),
  });

  const valid = kind === "email" ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target.trim()) : /^https:\/\/.+/.test(target.trim());

  return (
    <div>
      <Toolbar
        ariaLabel="Add delivery channel"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) create.mutate();
        }}
      >
        <Field label="Channel">
          <Select className="w-[120px]" value={kind} onChange={(e) => setKind(e.target.value as DeliveryKind)} options={[{ value: "webhook", label: "Webhook" }, { value: "email", label: "Email" }]} />
        </Field>
        <Field label={kind === "email" ? "Address" : "HTTPS URL"} className="w-[360px]">
          <Input type={kind === "email" ? "email" : "url"} value={target} onChange={(e) => setTarget(e.target.value)} placeholder={kind === "email" ? "alerts@example.com" : "https://hooks.example.com/taxatlas"} required />
        </Field>
        <Field label="Digest">
          <Select className="w-[130px]" value={digest} onChange={(e) => setDigest(e.target.value as DeliveryDigest)} options={[{ value: "instant", label: "Instant" }, { value: "daily", label: "Daily" }]} />
        </Field>
        <Button type="submit" variant="primary" loading={create.isPending} disabled={!valid}>
          Add channel
        </Button>
        <span className="ml-auto max-w-[440px] text-xs text-ink-3">
          Webhooks receive a signed JSON POST per matching change (a Slack or Teams incoming-webhook URL works). Email sends instantly or as a daily digest. Max <span className="mono">10</span> channels; filters are edited per channel after creation.
        </span>
      </Toolbar>

      {created?.secret && (
        <div className="border-b border-hairline bg-accent-soft px-4 py-3" role="region" aria-label="Webhook signing secret">
          <div className="mb-2 flex items-baseline gap-3">
            <p className="text-sm text-ink-1">
              Signing secret for <span className="mono">{created.target}</span> — shown once; store it with your receiver.
            </p>
            <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setCreated(null)}>
              Dismiss
            </Button>
          </div>
          <CodeBlock label="signing secret" code={created.secret} />
          <div className="mt-2">
            <CodeBlock label="verify (python)" code={VERIFY_SNIPPET} copy={false} />
          </div>
        </div>
      )}

      {list.isLoading ? (
        <TableSkeleton cols={6} rows={3} />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} what="delivery channels" />
      ) : list.data && list.data.length === 0 ? (
        <EmptyState title="No delivery channels configured." hint="Add a webhook or email channel above; each receives the change events that match your watchlist and the channel's filters." />
      ) : (
        <table className="tbl" aria-label="Delivery channels">
          <thead>
            <tr>
              <th>Channel</th>
              <th>Target</th>
              <th>Digest</th>
              <th>Filters</th>
              <th>Last delivered</th>
              <th>Health</th>
              <th>Enabled</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((c) => {
              const tr = testResults[c.id];
              const open = expanded === c.id;
              return (
                <ChannelRows key={c.id} c={c} open={open} test={tr}>
                  <td className="capitalize">
                    {c.kind}
                    {c.has_secret && (
                      <span className="ml-1.5 text-xs text-ink-3" title="HMAC-signed">
                        signed
                      </span>
                    )}
                  </td>
                  <td className="code max-w-[320px] truncate" title={c.target}>
                    {c.target}
                  </td>
                  <td>
                    <Select className="h-6 w-[96px] text-xs" value={c.digest} onChange={(e) => patch.mutate({ id: c.id, body: { digest: e.target.value as DeliveryDigest } })} options={[{ value: "instant", label: "Instant" }, { value: "daily", label: "Daily" }]} aria-label={`Digest for ${c.target}`} />
                  </td>
                  <td className="max-w-[240px] truncate text-xs text-ink-2" title={filtersSummary(c.filters)}>
                    {filtersSummary(c.filters)}
                  </td>
                  <td className="date" title={relTime(c.last_delivered_at)}>
                    {fmtDateTime(c.last_delivered_at)}
                  </td>
                  <td>
                    {c.disabled_reason ? (
                      <StatusMark value="disabled" label={`disabled · ${c.disabled_reason}`} title={c.disabled_reason} className="max-w-[220px] truncate" />
                    ) : c.consecutive_failures > 0 ? (
                      <StatusMark value="pending" label={`${c.consecutive_failures} failing`} title={c.last_error ?? undefined} />
                    ) : (
                      <StatusMark value="ok" />
                    )}
                    {c.last_error && !c.disabled_reason && (
                      <div className="mt-0.5 max-w-[220px] truncate text-xs text-negative" title={c.last_error}>
                        {c.last_error}
                      </div>
                    )}
                  </td>
                  <td>
                    <Toggle checked={c.enabled} ariaLabel={`${c.enabled ? "Disable" : "Enable"} channel ${c.target}`} disabled={patch.isPending} onChange={(v) => patch.mutate({ id: c.id, body: { enabled: v } })} />
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Button size="sm" variant="ghost" loading={test.isPending && test.variables === c.id} onClick={() => test.mutate(c.id)} title="Send a signed synthetic test event now">
                      Test
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit channel ${c.target}`}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : c.id)} aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} delivery attempts for ${c.target}`}>
                      {open ? "Hide attempts" : "Attempts"}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={remove.isPending && remove.variables === c.id}
                      onClick={() => {
                        if (window.confirm(`Delete channel ${c.target}?`)) remove.mutate(c.id);
                      }}
                      aria-label={`Delete channel ${c.target}`}
                    >
                      Delete
                    </Button>
                  </td>
                </ChannelRows>
              );
            })}
          </tbody>
        </table>
      )}

      <EntityFormDrawer
        open={!!editing}
        onClose={() => setEditing(null)}
        mode="edit"
        withReason={false}
        title={editing ? `Edit channel · ${editing.kind}` : "Edit channel"}
        subtitle={editing?.target}
        fields={DELIVERY_FILTER_FIELDS}
        initial={editing ? ({ target: editing.target, digest: editing.digest, tax_types: editing.filters?.tax_types ?? [], jurisdiction_codes: editing.filters?.jurisdiction_codes ?? [], change_types: editing.filters?.change_types ?? [] } as FormValues) : {}}
        onSubmit={async (body) => {
          if (!editing) return;
          const filterKeys = ["tax_types", "jurisdiction_codes", "change_types"] as const;
          const touched = filterKeys.some((k) => k in body);
          const merged = touched
            ? {
                tax_types: ((k) => (k in body ? (body[k] as string[] | null) : editing.filters?.tax_types ?? null))("tax_types"),
                jurisdiction_codes: ((k) => (k in body ? (body[k] as string[] | null) : editing.filters?.jurisdiction_codes ?? null))("jurisdiction_codes"),
                change_types: ((k) => (k in body ? (body[k] as string[] | null) : editing.filters?.change_types ?? null))("change_types"),
              }
            : null;
          const allEmpty = merged && !merged.tax_types?.length && !merged.jurisdiction_codes?.length && !merged.change_types?.length;
          const out: Parameters<typeof api.delivery.patch>[1] = {};
          if ("target" in body) out.target = body.target as string;
          if ("digest" in body) out.digest = body.digest as DeliveryDigest;
          if (touched) {
            if (allEmpty) out.clear_filters = true;
            else out.filters = merged;
          }
          await patch.mutateAsync({ id: editing.id, body: out });
          toast.success("Channel updated");
        }}
      />
    </div>
  );
}

/** A channel row plus its optional expanded attempts/test-result row. */
function ChannelRows({ c, open, test, children }: { c: DeliveryChannelOut; open: boolean; test?: DeliveryTestResult; children: React.ReactNode }) {
  return (
    <>
      <tr>{children}</tr>
      {(test || open) && (
        <tr>
          <td colSpan={8} className="!h-auto bg-surface-0 !px-4 !py-2">
            {test && (
              <div className="mb-2 flex flex-wrap items-center gap-4 text-xs">
                <StatusMark value={test.ok ? "success" : "failed"} label={test.ok ? "Test delivered" : "Test failed"} />
                <span className="mono text-ink-2">event {test.event_id}</span>
                {test.status_code != null && <span className="mono text-ink-2">HTTP {test.status_code}</span>}
                <span className="mono text-ink-2">{test.duration_ms} ms</span>
                {test.error && <span className="truncate text-negative">{test.error}</span>}
              </div>
            )}
            {open && <AttemptsList channelId={c.id} />}
          </td>
        </tr>
      )}
    </>
  );
}

function AttemptsList({ channelId }: { channelId: number }) {
  const q = useQuery({ queryKey: ["delivery-attempts", channelId], queryFn: () => api.delivery.attempts(channelId), refetchInterval: 15_000 });
  if (q.isLoading) return <div className="py-2 text-xs text-ink-3">Loading attempts…</div>;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} what="delivery attempts" />;
  if (!q.data?.length) return <div className="py-2 text-xs text-ink-3">No delivery attempts yet.</div>;
  return (
    <table className="tbl dense" aria-label="Delivery attempts">
      <thead>
        <tr>
          <th>When</th>
          <th>Notification</th>
          <th className="num">Attempt</th>
          <th>Status</th>
          <th className="num">HTTP</th>
          <th>Next retry</th>
          <th>Error</th>
        </tr>
      </thead>
      <tbody>
        {q.data.map((a) => (
          <tr key={a.id}>
            <td className="date">{fmtDateTime(a.created_at)}</td>
            <td className="code">#{a.notification_id}</td>
            <td className="num">{a.attempt_no}</td>
            <td>
              <StatusMark value={a.status} />
            </td>
            <td className="num">{a.http_status ?? "—"}</td>
            <td className="date">{a.next_attempt_at ? fmtDateTime(a.next_attempt_at) : "—"}</td>
            <td className="max-w-[360px] truncate text-xs text-negative" title={a.error ?? undefined}>
              {a.error ?? ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ API quickstart */

function QuickstartTab() {
  const q = useQuery({ queryKey: ["quickstart"], queryFn: api.meta.quickstart });
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: api.account.keys });
  const active = keys.data?.find((k) => !k.revoked_at);
  const placeholder = active ? `${active.prefix}…` : "ta_YOUR_KEY";
  const base = `${window.location.protocol}//${window.location.host}`;
  const groupOf = (path: string) => {
    const seg = path.replace(/^\/api\/v1\//, "").split(/[/?]/)[0];
    return seg.replace(/-/g, " ");
  };
  return (
    <div className="px-4 py-5">
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} what="quickstart" />}
      {q.data && (
        <div className="grid grid-cols-[200px_1fr] gap-8">
          <nav aria-label="Endpoints" className="flex flex-col gap-0.5 text-sm">
            <h2 className="section-title mb-1">Endpoints</h2>
            {q.data.examples.map((ex, i) => {
              const path = ex.replace(/^GET\s+/, "");
              return (
                <a key={ex} href={`#qs-${i}`} className="plain mono truncate py-1 text-xs text-ink-2 hover:text-ink-1" title={path}>
                  {path.replace(/^\/api\/v1/, "")}
                </a>
              );
            })}
            <h2 className="section-title mt-5 mb-1">Documentation</h2>
            <a href="/api/docs" target="_blank" rel="noreferrer" className="py-1 text-sm">
              Swagger UI (/api/docs)
            </a>
            <a href="/redoc" target="_blank" rel="noreferrer" className="py-1 text-sm">
              ReDoc (/redoc)
            </a>
            <a href="/openapi.json" target="_blank" rel="noreferrer" className="py-1 text-sm">
              OpenAPI schema
            </a>
          </nav>
          <div className="flex min-w-0 flex-col gap-4">
            <p className="max-w-[72ch] text-sm text-ink-2">{q.data.auth}</p>
            {q.data.examples.map((ex, i) => {
              const path = ex.replace(/^GET\s+/, "");
              const curl = `curl -s -H "X-API-Key: ${placeholder}" \\\n  "${base}${path}"`;
              return (
                <div key={ex} id={`qs-${i}`}>
                  <CodeBlock label={`curl · ${groupOf(path)}`} code={curl} />
                </div>
              );
            })}
            <p className="text-xs text-ink-3">
              Replace <span className="mono text-ink-2">{placeholder}</span> with a full key (plaintext is shown only at creation).
            </p>
            <section>
              <h2 className="section-title">Rate-limit headers</h2>
              <KV
                rows={q.data.rate_limit_headers.map((h) => [h, describeHeader(h)] as [string, React.ReactNode])}
                className="[&_dt]:mono [&_dt]:text-ink-2 grid-cols-[220px_1fr]"
              />
            </section>
            <section>
              <h2 className="section-title">Bulk export</h2>
              <ul className="flex flex-col gap-1 text-sm text-ink-2">
                <li>
                  <span className="mono">GET /api/taxatlas/v1/export/snapshot?jurisdiction=DE</span> — full JSON snapshot for one jurisdiction
                </li>
                <li>
                  <span className="mono">GET /api/taxatlas/v1/export/rates.csv?tax_type=vat</span> — rates as CSV
                </li>
              </ul>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function describeHeader(h: string): string {
  if (/limit$/i.test(h)) return "Requests allowed per minute for this key or session.";
  if (/remaining$/i.test(h)) return "Requests left in the current window.";
  if (/reset$/i.test(h)) return "Seconds until the window resets; also sent as Retry-After on 429.";
  return "Returned on every response.";
}

/* ------------------------------------------------------------------ About */

function AboutTab() {
  const stats = useQuery({ queryKey: ["stats"], queryFn: api.stats.overview });
  const s = stats.data;
  return (
    <div className="grid grid-cols-[1fr_1fr] gap-10 px-4 py-5">
      <section>
        <h2 className="section-title">Build</h2>
        <KV
          rows={[
            ["Version", APP_VERSION, { mono: true }],
            ["Mode", process.env.NODE_ENV ?? "development", { mono: true }],
            ["Dataset snapshot", s?.last_crawl_at ? `${new Date(s.last_crawl_at).toISOString().replace("T", " ").slice(0, 16)} UTC` : "—", { mono: true }],
            ["Sources", s ? `${s.sources_enabled} of ${s.sources} enabled` : "—"],
            ["Coverage", s ? `${fmtInt(s.countries)} countries · ${fmtInt(s.subnational)} sub-national` : "—"],
          ]}
        />
      </section>
      <section className="max-w-[60ch] text-sm leading-relaxed text-ink-2">
        <h2 className="section-title">Attribution</h2>
        <p>Map geometry: Natural Earth, via world-atlas and us-atlas (public domain). Rates, regulations, court decisions and tariff measures are collected from the official publishers listed under Sources, on the schedules shown there.</p>
        <h2 className="section-title mt-5">Reference data</h2>
        <p>TaxAtlas aggregates public information for monitoring purposes. It is not tax, legal or trade advice; verify every figure against the primary authority before reliance. Figures carry a confidence marker and an as-of date where known.</p>
      </section>
    </div>
  );
}
