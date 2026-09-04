import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@/components/firmcrm/lib/query";
import { Link } from "@/components/firmcrm/lib/navigation";
import { Check } from "lucide-react";
import { activitiesApi } from "@/components/firmcrm/api";
import type { Activity } from "@/components/firmcrm/api/types";
import { Badge, PageHeader, Tabs, cn } from "@/components/firmcrm/components/ui";
import { DataTable, type Column } from "@/components/firmcrm/components/ui/DataTable";
import { useToast } from "@/components/firmcrm/components/ui/Toast";
import { Pagination, usePager } from "@/components/firmcrm/components/ui/Pagination";
import { fmtDate, fmtDateTime, titleCase } from "@/components/firmcrm/lib/format";
import { Dash, cellText } from "@/components/firmcrm/components/ui/cells";

/** Checkbox-style done control (§6.10 checkbox) inside a 28×28 hit area (§6.9 icon button; QA #17). */
function DoneControl({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={done} aria-label={done ? "Reopen task" : "Mark task done"}
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="group -ml-1.5 grid h-7 w-7 place-items-center rounded-crm-md transition-colors duration-[120ms] hover:bg-crm-sand-100 focus-visible:outline-2 focus-visible:outline-crm-accent-600">
      <span className={cn("grid h-4 w-4 place-items-center rounded-[3px] border transition-colors duration-[120ms]", done ? "border-crm-accent-600 bg-crm-accent-600 text-white group-hover:bg-crm-accent-700" : "border-crm-sand-300 bg-crm-sand-0 group-hover:border-crm-sand-400")} aria-hidden>
        {done && <Check size={10} strokeWidth={3} />}
      </span>
    </button>
  );
}

export default function TasksPage() {
  const qc = useQueryClient(); const { error } = useToast();
  const [tab, setTab] = useState<"mine" | "all" | "recent">("mine");
  const pager = usePager(50);
  const q = useQuery({ queryKey: ["activities", "tasks", tab, pager.limit, pager.offset], queryFn: () => tab === "recent" ? activitiesApi.list({ limit: pager.limit, offset: pager.offset }) : activitiesApi.list({ open_tasks: true, mine: tab === "mine", limit: pager.limit, offset: pager.offset }) });
  const complete = useMutation({ mutationFn: (a: Activity) => activitiesApi.update(a.id, { completed: !a.completed_at }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["activities"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); }, onError: error });
  const linkCls = "block max-w-[220px] truncate whitespace-nowrap";
  const related = (a: Activity) => a.opportunity_id ? <Link to={`/opportunities/${a.opportunity_id}`} className={linkCls} title={a.opportunity_name ?? undefined}>{a.opportunity_name}</Link> : a.account_id ? <Link to={`/accounts/${a.account_id}`} className={linkCls} title={a.account_name ?? undefined}>{a.account_name}</Link> : a.contact_id ? <Link to={`/contacts/${a.contact_id}`} className={linkCls} title={a.contact_name ?? undefined}>{a.contact_name}</Link> : a.lead_name ? cellText(`Lead · ${a.lead_name}`, 220) : <Dash />;
  const overdue = (a: Activity) => !!a.due_at && new Date(a.due_at) < new Date() && !a.completed_at;
  // Non-task rows render a dash in the task-only cells (§6.6 empty = — in sand-300; QA #17).
  const cols: Column<Activity>[] = [
    { key: "done", header: "", width: "44px", render: (a) => a.kind === "task" ? <DoneControl done={!!a.completed_at} onToggle={() => complete.mutate(a)} /> : <Dash /> },
    { key: "subject", header: "Subject", sort: (a) => a.subject, render: (a) => <div className="min-w-0 max-w-[420px]"><div className={cn("truncate font-medium", a.completed_at ? "text-crm-sand-400 line-through" : "text-crm-sand-900")}>{a.subject}</div>{a.body && <div className="truncate text-[12px] leading-4 text-crm-sand-500">{a.body}</div>}</div> },
    { key: "kind", header: "Type", sort: (a) => a.kind, width: "100px", render: (a) => <Badge>{titleCase(a.kind)}</Badge> },
    { key: "related", header: "Related to", render: related },
    { key: "owner", header: "Owner", sort: (a) => a.owner_name ?? "", width: "150px", hideBelow: 1280, render: (a) => cellText(a.owner_name) },
    { key: "due", header: tab === "recent" ? "When" : "Due", width: tab === "recent" ? "180px" : "120px", sort: (a) => (tab === "recent" ? a.occurred_at : a.due_at) ?? "", render: (a) => tab === "recent" ? <span className="num whitespace-nowrap">{fmtDateTime(a.occurred_at)}</span> : a.due_at ? <span className={cn("num whitespace-nowrap", overdue(a) && "font-medium text-crm-danger-600")}>{fmtDate(a.due_at)}</span> : <Dash /> },
    { key: "prio", header: "Priority", sort: (a) => a.priority, width: "110px", hideBelow: 1180, render: (a) => a.kind === "task" ? <Badge dot tone={a.priority === "high" ? "danger" : a.priority === "low" ? "neutral" : "info"}>{titleCase(a.priority)}</Badge> : <Dash /> },
  ];
  return (
    <div>
      <PageHeader title="Tasks and activity" subtitle="Open follow-ups across the firm, and the recent activity stream" />
      <Tabs value={tab} onChange={(t) => { setTab(t); pager.reset(); }} tabs={[{ key: "mine", label: "My open tasks", count: tab === "mine" ? q.data?.total : undefined }, { key: "all", label: "All open tasks", count: tab === "all" ? q.data?.total : undefined }, { key: "recent", label: "Recent activity" }]} />
      <div className="card mt-5 overflow-hidden">
        <DataTable rows={q.data?.items} columns={cols} loading={q.isLoading} twoLine initialSort={{ key: "due", dir: tab === "recent" ? "desc" : "asc" }} empty={tab === "recent" ? "No recent activity" : "No open tasks"} />
        <Pagination total={q.data?.total} limit={pager.limit} offset={pager.offset} onOffset={pager.setOffset} onLimit={pager.setLimit} />
      </div>
    </div>
  );
}
