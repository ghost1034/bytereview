import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button, Select } from "./index";

export function usePager(initialLimit = 50) {
  const [limit, setLimit] = useState(initialLimit);
  const [offset, setOffset] = useState(0);
  return { limit, offset, setLimit: (l: number) => { setLimit(l); setOffset(0); }, setOffset, reset: () => setOffset(0) };
}

export function Pagination({ total, limit, offset, onOffset, onLimit }: { total: number | undefined; limit: number; offset: number; onOffset: (o: number) => void; onLimit?: (l: number) => void }) {
  // Nothing to page through: the empty state carries the message (§6.16); no "0–0 of 0" footer.
  if (total === undefined || total === 0) return null;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <div className="flex h-11 items-center justify-between border-t border-crm-sand-150 bg-crm-sand-0 px-4 text-[12px] leading-4 text-crm-sand-500">
      <div className="flex items-center gap-3">
        <span className="num">{from}–{to} of {total}</span>
        {onLimit && <Select value={limit} options={[25, 50, 100, 250].map((n) => ({ value: n, label: `${n} / page` }))} onChange={(e) => onLimit(Number(e.target.value))} className="!h-7 !w-[108px] text-[12px]" aria-label="Rows per page" />}
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - limit))}><ChevronLeft size={14} />Prev</Button>
        <Button size="sm" variant="ghost" disabled={offset + limit >= total} onClick={() => onOffset(offset + limit)}>Next<ChevronRight size={14} /></Button>
      </div>
    </div>
  );
}
