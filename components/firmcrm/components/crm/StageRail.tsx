/* Dot-and-rail stage stepper (DESIGN.md §6.13). Replaces the block stepper on the opportunity detail page. */
import { Check, Lock, Trophy } from "lucide-react";
import type { Stage } from "@/components/firmcrm/api/types";
import { cn } from "@/components/firmcrm/components/ui";

export type RailStatus = "open" | "won" | "lost";

export function StageRail({ stages, currentStageId, status, lostReason, daysInStage, gate, terminalGate, onMove, canMove = true, className }: {
  stages: Stage[];                          // open stages in pipeline order
  currentStageId: number;
  status: RailStatus;
  lostReason?: string | null;
  daysInStage?: number;
  /** Returns a tooltip string when the step has an unmet gate, else null. */
  gate?: (s: Stage) => string | null;
  /** Unmet gate on the terminal (Close) cell, e.g. unsigned engagement letter. */
  terminalGate?: string | null;
  onMove?: (stageId: number) => void;
  canMove?: boolean;
  className?: string;
}) {
  const current = stages.find((s) => s.id === currentStageId);
  const curPos = current?.position ?? -1;
  return (
    <div className={cn("card flex items-stretch px-5 pt-4 pb-3.5", className)}>
      <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${stages.length || 1}, minmax(0, 1fr))` }}>
        {stages.map((s, i) => {
          const isCurrent = status === "open" && s.id === currentStageId;
          const done = status === "won" || (status === "open" && s.position < curPos) || (status === "lost" && s.position < curPos);
          const lostHere = status === "lost" && s.id === currentStageId;
          const future = !isCurrent && !done && !lostHere;
          const clickable = canMove && status === "open" && !isCurrent && !!onMove;
          const gateMsg = gate?.(s) ?? null;
          const reached = (x: Stage | undefined) => !!x && (status === "won" || x.position <= curPos);
          const leftLit = reached(s);
          const rightLit = reached(stages[i + 1]);
          return (
            <button key={s.id} type="button" disabled={!clickable} onClick={() => clickable && onMove?.(s.id)}
                    className={cn("group relative flex flex-col items-center rounded-crm-md px-1 pt-1 pb-1 text-center disabled:cursor-default", clickable && "hover:bg-crm-sand-25")}
                    aria-current={isCurrent ? "step" : undefined} title={clickable ? `Move to ${s.name}` : undefined}>
              {/* rail halves */}
              <span aria-hidden className={cn("absolute top-[11px] left-0 h-px w-1/2", i === 0 ? "bg-transparent" : leftLit ? "bg-crm-accent-600" : "bg-crm-sand-150")} />
              <span aria-hidden className={cn("absolute top-[11px] right-0 h-px w-1/2", i === stages.length - 1 ? "bg-transparent" : rightLit ? "bg-crm-accent-600" : "bg-crm-sand-150")} />
              {/* dot */}
              <span aria-hidden className={cn("relative z-[1] grid place-items-center rounded-full",
                isCurrent ? "h-3.5 w-3.5 bg-crm-accent-600 shadow-[0_0_0_4px_var(--firmcrm-color-accent-100)]"
                : done ? "h-3 w-3 bg-crm-accent-600 text-white"
                : lostHere ? "h-3 w-3 bg-crm-danger-600"
                : "h-3 w-3 border border-crm-sand-300 bg-crm-sand-0")}>
                {done && <Check size={8} strokeWidth={3} />}
              </span>
              <span className={cn("mt-2.5 inline-flex items-center gap-1 text-[12px] leading-4 font-medium",
                isCurrent ? "font-semibold text-crm-sand-900" : done ? "text-crm-sand-700" : lostHere ? "text-crm-danger-700" : "text-crm-sand-500", clickable && future && "group-hover:text-crm-sand-900")}>
                {s.name}
                {gateMsg && <span title={gateMsg} className="inline-flex text-crm-warn-600"><Lock size={12} aria-label={gateMsg} /></span>}
              </span>
              <span className="mono mt-0.5 text-[11px] text-crm-sand-400">{s.probability}%</span>
              {isCurrent && daysInStage != null && <span className="mt-0.5 text-[11px] leading-4 text-crm-sand-500 num">Day {daysInStage} in stage</span>}
            </button>
          );
        })}
      </div>
      <div className="ml-4 flex w-[148px] shrink-0 flex-col items-center justify-center border-l border-crm-sand-150 pl-4 text-[12px] leading-4 font-medium">
        {status === "won" ? (
          <span className="inline-flex items-center gap-1.5 text-crm-success-700"><Trophy size={14} />Closed Won</span>
        ) : status === "lost" ? (
          <span className="text-center text-crm-danger-700">Lost{lostReason ? <> · <span className="capitalize">{lostReason}</span></> : null}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-crm-sand-400">Close{terminalGate && <span title={terminalGate} className="inline-flex text-crm-warn-600"><Lock size={12} aria-label={terminalGate} /></span>}</span>
        )}
        {status === "open" && terminalGate && <span className="mt-1 max-w-[132px] text-center text-[11px] leading-[14px] font-normal text-crm-sand-500">{terminalGate}</span>}
      </div>
    </div>
  );
}
