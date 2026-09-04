import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, Lock, Search, ShieldOff } from "lucide-react";
import { conflictsApi } from "@/api";
import type { ConflictCheck, ConflictMatch } from "@/api/types";
import { Badge, Button, Card, Empty, Field, Modal, PageHeader, Select, Spinner, Tabs, Textarea, cn, statusTone } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { Pagination, usePager } from "@/components/ui/Pagination";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, titleCase } from "@/lib/format";
import { INDEPENDENCE_QUESTIONS } from "@/lib/options";

/** `flush`: inside a card, run the table edge-to-edge (§6.6 — the card is the table wrapper; no box-in-box). */
function Matches({ matches, flush }: { matches: ConflictMatch[]; flush?: boolean }) {
  if (!matches.length) return <div className="text-[12px] leading-4 text-success-700">No matches found.</div>;
  return (
    <div className={flush ? "-mx-5 border-t border-sand-150 [&:not(:last-child)]:border-b" : "overflow-hidden rounded-lg border border-sand-150"}>
      <table className="tbl dense">
        <thead><tr><th className={cn(flush && "!pl-5")}>Searched</th><th>Matched</th><th>Type</th><th>Relationship</th><th className={cn("!text-right", flush && "!pr-5")}>Score</th></tr></thead>
        <tbody>{matches.map((m, i) => (
          <tr key={i}>
            <td className={cn("!h-auto !py-2 align-top", flush && "!pl-5")}>{m.party}</td>
            <td className="!h-auto !py-2 align-top">
              <div className="font-medium text-sand-900">{m.matched_name}</div>
              {m.context && <div className="text-[12px] leading-4 text-sand-500">{m.context}</div>}
              {m.restricted && <div className="mt-0.5 inline-flex items-center gap-1 text-[12px] leading-4 text-sand-500"><Lock size={12} />Restricted matter — details withheld by an ethical wall</div>}
            </td>
            <td className="!h-auto !py-2 align-top">{titleCase(m.entity)}</td>
            <td className="!h-auto !py-2 align-top"><Badge dot tone={statusTone(m.relationship)}>{titleCase(m.relationship)}</Badge></td>
            <td className={cn("!h-auto !py-2 text-right align-top num", flush && "!pr-5")}>{(m.score * 100).toFixed(0)}%</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

/** Any "yes" on the attestation is a disclosed relationship; only a partner/admin may resolve it (flows QA #6). */
export const hasDisclosure = (c: ConflictCheck) => !!c.independence_attestation && Object.values(c.independence_attestation).some(Boolean);

function ResolveModal({ check, onClose }: { check: ConflictCheck; onClose: () => void }) {
  const qc = useQueryClient(); const { toast, error } = useToast(); const { hasRole } = useAuth();
  const [status, setStatus] = useState("clear"); const [note, setNote] = useState("");
  const isPartner = hasRole("partner", "admin");
  const disclosed = hasDisclosure(check);
  const readOnly = disclosed && !isPartner;
  // Resolved checks are immutable for managers; a partner may override, but only with a note, and the prior decision stays in the audit log (flows QA #7).
  const override = check.status !== "pending";
  const noteRequired = override || status === "waived";
  const m = useMutation({ mutationFn: () => conflictsApi.resolve(check.id, { status, resolution_note: note.trim() || undefined }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["checks"] }); qc.invalidateQueries({ queryKey: ["opp"] }); qc.invalidateQueries({ queryKey: ["opps"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast(override ? `Decision overridden — now ${status}` : `Check ${status}`); onClose(); }, onError: error });
  const opts = [{ value: "clear", label: "Clear — no conflict" }, { value: "conflict", label: "Conflict — decline / cannot proceed" }, ...(isPartner ? [{ value: "waived", label: "Waived — proceed with consent (partner)" }] : [])];
  const isConflict = status === "conflict";
  const blocked = m.isPending || (noteRequired && !note.trim());
  return (
    <Modal open onClose={onClose} title={<>{override ? "Override decision" : `Resolve ${check.check_type} check`} <span className="mono text-sand-500">#{check.id}</span></>} size="wide"
           footer={readOnly ? <Button onClick={onClose}>Close</Button> : <><Button onClick={onClose}>Cancel</Button>
             {isConflict
               ? <Button variant="danger-solid" onClick={() => m.mutate()} disabled={blocked}>{override ? "Override as conflict" : "Record conflict"}</Button>
               : <Button variant="primary" onClick={() => m.mutate()} disabled={blocked}>{override ? "Override decision" : "Record decision"}</Button>}</>}>
      <div className="space-y-4">
        <div>
          <div className="label">Potential matches</div>
          <Matches matches={check.matches} />
        </div>
        {check.independence_attestation && (
          <div>
            <div className="label">Independence attestation</div>
            <ul className="divide-y divide-sand-100 rounded-md border border-sand-150">
              {INDEPENDENCE_QUESTIONS.map((q) => { const yes = !!check.independence_attestation?.[q.key]; return (
                <li key={q.key} className="flex items-start gap-3 px-3 py-2 text-[13px] leading-5"><Badge dot tone={yes ? "danger" : "success"} className="mt-0.5 w-10 shrink-0">{yes ? "Yes" : "No"}</Badge><span className={yes ? "text-sand-900" : "text-sand-600"}>{q.label}</span></li>); })}
            </ul>
          </div>)}
        {readOnly ? (
          <div className="flex items-start gap-2 rounded-md border border-warn-200 bg-warn-50 px-3 py-2.5 text-[13px] leading-5 text-warn-700" role="status">
            <Lock size={14} className="mt-0.5 shrink-0 text-warn-600" aria-hidden />
            <div><div className="font-medium">Disclosed relationship — partner review required</div><div className="mt-0.5 text-[12px] leading-4">A “yes” on the independence attestation routes this check to a partner. You can review the details here but cannot record the decision.</div></div>
          </div>
        ) : (<>
          {override && (
            <div className="flex items-start gap-2 rounded-md border border-warn-200 bg-warn-50 px-3 py-2.5 text-[12px] leading-4 text-warn-700" role="status">
              <AlertTriangle size={14} className="mt-px shrink-0 text-warn-600" aria-hidden />
              <span>This check was already resolved as <span className="font-medium">{titleCase(check.status)}</span>{check.resolved_by_name ? <> by {check.resolved_by_name}</> : null}{check.resolved_at ? <> on <span className="num">{fmtDateTime(check.resolved_at)}</span></> : null}. The prior decision and its note are retained in the audit log; a note explaining the override is required.</span>
            </div>)}
          {override && check.resolution_note && <div className="rounded-md bg-sand-25 px-3 py-2 text-[13px] leading-5 text-sand-700"><span className="text-sand-500">Prior note:</span> {check.resolution_note}</div>}
          <Field label="Decision"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={opts} /></Field>
          <Field label={noteRequired ? "Resolution note *" : "Resolution note"} hint={override ? "Required: explain why the prior decision is being overridden." : status === "waived" ? "Required: document the basis for waiver and consent obtained." : check.matches.length ? "Required when clearing with matches: explain why each match is not a conflict." : "Optional."}><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </>)}
      </div>
    </Modal>
  );
}

export function ClearanceList({ checks, loading, compact }: { checks: ConflictCheck[] | undefined; loading?: boolean; compact?: boolean }) {
  const { atLeast, hasRole } = useAuth();
  const isPartner = hasRole("partner", "admin");
  const [resolving, setResolving] = useState<ConflictCheck | null>(null);
  if (loading) return <Spinner />;
  if (!checks?.length) return compact ? <div className="text-[12px] leading-4 text-sand-500">No checks recorded.</div> : <Empty title="No clearance checks" hint="Run a check from an opportunity or account." />;
  return (
    <div className={compact ? "divide-y divide-sand-100" : "space-y-3"}>
      {checks.map((c) => {
        const disclosed = c.independence_attestation ? INDEPENDENCE_QUESTIONS.filter((q) => c.independence_attestation?.[q.key]) : [];
        return (
          <article key={c.id} className={compact ? "py-3 text-[12px] leading-4 first:pt-0 last:pb-0" : "card px-5 py-4 text-[13px] leading-5"}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-sand-900">{titleCase(c.check_type)} check</span>
                  <span className="mono text-sand-500">#{c.id}</span>
                  <Badge dot tone={statusTone(c.status)}>{titleCase(c.status)}</Badge>
                  {c.status === "waived" && <ShieldOff size={12} className="text-success-600" aria-label="Waived" />}
                </div>
                <div className="mt-0.5 text-[12px] leading-4 text-sand-500">
                  {c.requested_by_name}<span className="mx-1.5 text-sand-300">·</span><span className="num">{fmtDateTime(c.created_at)}</span>
                  {!compact && c.opportunity_id && <><span className="mx-1.5 text-sand-300">·</span><Link to={`/opportunities/${c.opportunity_id}`} className="text-sand-700">{c.opportunity_name}</Link></>}
                  {!compact && !c.opportunity_id && c.account_id && <><span className="mx-1.5 text-sand-300">·</span><Link to={`/accounts/${c.account_id}`} className="text-sand-700">{c.account_name}</Link></>}
                </div>
              </div>
              {/* Pending: manager+ reviews (a disclosed independence check opens read-only for managers). Resolved: only a partner/admin may override (flows QA #6, #7). */}
              {c.status === "pending"
                ? atLeast("manager") && <Button size="sm" variant="secondary" onClick={() => setResolving(c)}>Review</Button>
                : isPartner && <Button size="sm" variant="ghost" onClick={() => setResolving(c)}>Override decision</Button>}
            </div>
            <div className={cn("text-sand-600", compact ? "mt-1.5" : "mt-2.5")}><span className="text-sand-500">Parties:</span> {c.parties.join("; ")}</div>
            {c.matches.length > 0 && (compact
              ? <div className="mt-1.5 text-warn-700"><span className="num">{c.matches.length}</span> potential match{c.matches.length === 1 ? "" : "es"}: {c.matches.slice(0, 3).map((m) => m.matched_name).join(", ")}{c.matches.length > 3 ? "…" : ""}</div>
              : <div className="mt-3"><Matches matches={c.matches} flush /></div>)}
            {disclosed.length > 0 && <div className="mt-1.5 text-warn-700">Attestation disclosed: {disclosed.map((q) => q.key.replace(/_/g, " ")).join(", ")}</div>}
            {c.resolution_note && <div className={cn("rounded-md bg-sand-25 px-3 py-2 text-sand-700", compact ? "mt-2" : "mt-3")}><span className="text-sand-500">Resolution ({c.resolved_by_name}, <span className="num">{fmtDateTime(c.resolved_at)}</span>):</span> {c.resolution_note}</div>}
          </article>);
      })}
      {resolving && <ResolveModal check={resolving} onClose={() => setResolving(null)} />}
    </div>
  );
}

export default function ClearancePage() {
  const [tab, setTab] = useState<"pending" | "all" | "search">("pending");
  const [parties, setParties] = useState(""); const [results, setResults] = useState<ConflictMatch[] | null>(null);
  const { error } = useToast();
  const pager = usePager(25);
  const checks = useQuery({ queryKey: ["checks", tab, pager.limit, pager.offset], queryFn: () => conflictsApi.list({ ...(tab === "pending" ? { status: "pending" } : {}), limit: pager.limit, offset: pager.offset }), enabled: tab !== "search" });
  // Tab counts are part of the label (§6.12) and must not disappear when the other tab is active: two cheap limit=1 totals.
  const pendingTotal = useQuery({ queryKey: ["checks", "count", "pending"], queryFn: () => conflictsApi.list({ status: "pending", limit: 1 }), select: (p) => p.total });
  const allTotal = useQuery({ queryKey: ["checks", "count", "all"], queryFn: () => conflictsApi.list({ limit: 1 }), select: (p) => p.total });
  const search = useMutation({ mutationFn: () => conflictsApi.search(parties.split("\n").map((s) => s.trim()).filter(Boolean)), onSuccess: setResults, onError: error });
  return (
    <div>
      <PageHeader title="Clearance" subtitle="Conflict checks (legal) and independence checks (attest). Pending items block Closed Won until a manager or partner resolves them." />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: "pending", label: "Pending review", count: pendingTotal.data }, { key: "all", label: "All checks", count: allTotal.data }, { key: "search", label: "Ad-hoc search" }]} />
      <div className="mt-5">
        {tab !== "search" ? (
          <>
            <ClearanceList checks={checks.data?.items} loading={checks.isLoading} />
            {checks.data && checks.data.total > pager.limit && <div className="card mt-3 overflow-hidden"><Pagination total={checks.data.total} limit={pager.limit} offset={pager.offset} onOffset={pager.setOffset} onLimit={pager.setLimit} /></div>}
          </>) : (
          <Card title="Search the firm database">
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Field label="Names to check (one per line)"><Textarea value={parties} onChange={(e) => setParties(e.target.value)} className="min-h-[140px] font-mono text-[12px]" placeholder={"Acme Holdings\nJane Doe\nBrightline Transport"} /></Field>
                <Button variant="primary" className="mt-3" onClick={() => search.mutate()} disabled={!parties.trim() || search.isPending}><Search size={14} />Search</Button>
                <div className="mt-3 text-[12px] leading-4 text-sand-500">Ad-hoc search does not record a check. Run the check from the opportunity to create an auditable record.</div>
              </div>
              <div>
                <div className="label">Results</div>
                {results === null ? <div className="text-[12px] leading-4 text-sand-500">Results will appear here.</div> : <Matches matches={results} />}
              </div>
            </div>
          </Card>)}
      </div>
    </div>
  );
}
