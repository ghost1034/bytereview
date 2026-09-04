/* Kanban card for the Opportunities board (DESIGN.md §6.7).
   Name (2-line clamp) → account → money | expected close → chips + owner avatar.
   State is signalled with an edge bar, a shield glyph, or a chip — never by recolouring the whole border. */
import { useState, type DragEvent } from "react";
import { CalendarClock, FileCheck, Lock, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import type { Opportunity } from "@/components/firmcrm/api/types";
import { Badge, cn } from "@/components/firmcrm/components/ui";
import { fmtDate, initials, useMoney } from "@/components/firmcrm/lib/format";

const DAY = 86_400_000;
export const daysSince = (iso: string | null | undefined) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)) : null);
export const isPastDue = (o: Opportunity) => !!o.expected_close && o.status === "open" && new Date(o.expected_close + "T23:59:59") < new Date();

/** Clearance shield: ShieldCheck (clear/waived) · ShieldAlert (pending / not run) · ShieldX (conflict). */
export function ClearanceShield({ o, size = 14, className }: { o: Opportunity; size?: number; className?: string }) {
  if (!o.clearance_type) return null;
  const s = o.clearance_status;
  const kind = o.clearance_type === "conflict" ? "Conflict" : "Independence";
  const label = `${kind} check: ${s ?? "not run"}`;
  const ok = s === "clear" || s === "waived";
  const bad = s === "conflict";
  const Icon = ok ? ShieldCheck : bad ? ShieldX : ShieldAlert;
  return <span title={label} aria-label={label} className={cn("inline-flex shrink-0", ok ? "text-crm-success-600" : bad ? "text-crm-danger-600" : "text-crm-warn-600", className)}><Icon size={size} strokeWidth={1.75} /></span>;
}

/** Amber dot chip "23d · stale". */
export function StaleChip({ o }: { o: Opportunity }) {
  if (!o.is_stale) return null;
  const d = daysSince(o.last_activity_at) ?? o.days_in_stage;
  return (
    <span className="inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full bg-crm-warn-50 px-1.5 text-[11px] leading-[14px] font-medium text-crm-warn-700 num" title="No activity within the firm’s configured stale period">
      <i className="inline-block h-[5px] w-[5px] rounded-full bg-crm-warn-600" aria-hidden />{d}d · stale
    </span>
  );
}

export function KanbanCard({ o, onOpen, restricted }: { o: Opportunity; onOpen: (o: Opportunity) => void; restricted?: boolean }) {
  const money = useMoney();
  const [dragging, setDragging] = useState(false);
  const pastDue = isPastDue(o);
  const el = o.engagement_letter_status;
  // Clearance state lives in the corner shield (with tooltip); only a recorded conflict also gets a chip, since it blocks the pursuit.
  const clearanceConflict = !!o.clearance_type && o.clearance_status === "conflict";
  const onDragStart = (e: DragEvent) => { e.dataTransfer.setData("text/plain", String(o.id)); e.dataTransfer.effectAllowed = "move"; setDragging(true); };
  return (
    <div draggable={o.status === "open"} onDragStart={onDragStart} onDragEnd={() => setDragging(false)} onClick={() => onOpen(o)}
         onKeyDown={(e) => { if (e.key === "Enter") onOpen(o); }} role="button" tabIndex={0}
         className={cn("relative rounded-crm-lg border bg-crm-sand-0 px-3 pt-3 pb-2.5 text-[13px] leading-5 transition-[border-color,box-shadow,transform] duration-[120ms]",
           o.status === "open" ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
           dragging ? "border-crm-accent-300 shadow-crm-drag rotate-[0.5deg] scale-[1.01]" : "border-crm-sand-150 hover:border-crm-sand-300",
           o.is_stale && "shadow-[inset_2px_0_0_var(--firmcrm-color-warn-600)]")}>
      <ClearanceShield o={o} className="absolute top-3 right-3" />
      <div className="line-clamp-2 pr-6 font-medium text-crm-sand-900">{o.name}</div>
      <div className="mt-0.5 flex items-center gap-1 text-[12px] leading-4 text-crm-sand-500">
        {restricted && <Lock size={12} className="shrink-0" aria-label="Restricted by ethical wall" />}
        <span className="truncate">{o.account_name}</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="font-semibold text-crm-sand-900 num">{money(o.amount)}</span>
        <span className={cn("inline-flex items-center gap-1 text-[12px] leading-4 num", pastDue ? "font-medium text-crm-danger-600" : "text-crm-sand-500")} title={pastDue ? "Expected close date has passed" : undefined}>
          {pastDue && <CalendarClock size={12} />}{fmtDate(o.expected_close)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {o.practice_area_name && <Badge>{o.practice_area_name}</Badge>}
        {o.is_recurring && <Badge>Recurring</Badge>}
        {clearanceConflict && <Badge tone="danger">Conflict</Badge>}
        {el === "signed" && <Badge tone="success"><FileCheck size={11} />EL signed</Badge>}
        {el === "sent" && <Badge tone="warn">EL sent</Badge>}
        <StaleChip o={o} />
        {o.owner_name && <span className="ml-auto grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-crm-sand-200 text-[9px] font-semibold text-crm-sand-700" title={o.owner_name}>{initials(o.owner_name)}</span>}
      </div>
    </div>
  );
}
