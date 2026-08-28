/* Detail panel — adapter over ui/Drawer (components.md §4) with the WP-C slot names kept stable for the drawers,
   the admin form and the map slide-over: `idLine` → kicker, `serif` → titleSerif, `foot` + ↑/↓ row navigation → footer.
   `PushLayout` wraps ui/PageWithPanel and keeps the `.ta-inner` page rhythm. */
import type { ReactNode } from "react";
import { Drawer, KV, PageWithPanel } from "@/taxatlas-ui/components/ui/Drawer";
import "./lists.css";

export type PanelMode = "push" | "overlay";

export function PushLayout({ children, panel }: { children: ReactNode; panel?: ReactNode }) {
  return (
    <PageWithPanel panel={panel} className={panel ? "ta-page ta-page-open" : "ta-page"}>
      <div className="ta-inner">{children}</div>
    </PageWithPanel>
  );
}

export function DetailPanel({
  mode = "push",
  open,
  onClose,
  label,
  idLine,
  title,
  serif,
  children,
  foot,
  onPrev,
  onNext,
  modal,
  wide,
  headActions,
  copyLink = true,
}: {
  mode?: PanelMode;
  open: boolean;
  onClose: () => void;
  label: string;
  idLine?: ReactNode;
  title?: ReactNode;
  serif?: boolean;
  children: ReactNode;
  foot?: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  /** Overlay + scrim + focus trap (forms). */
  modal?: boolean;
  wide?: boolean;
  headActions?: ReactNode;
  copyLink?: boolean;
}) {
  const footer =
    foot || onPrev || onNext ? (
      <>
        {foot}
        <span className="spacer" />
        {(onPrev || onNext) && (
          <div className="nav-rows" style={{ display: "flex", gap: 2 }}>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Previous row" title="Previous row (↑)" disabled={!onPrev} onClick={onPrev}>↑</button>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Next row" title="Next row (↓)" disabled={!onNext} onClick={onNext}>↓</button>
          </div>
        )}
      </>
    ) : undefined;
  return (
    <Drawer open={open} onClose={onClose} mode={modal ? "overlay" : mode} modal={modal} ariaLabel={label} kicker={idLine} title={title} titleSerif={serif} actions={headActions} copyLink={copyLink} footer={footer} width={wide ? "560px" : undefined}>
      {children}
    </Drawer>
  );
}

/** Definition list: 120 px label column, mono values where numeric (ui/KV). Empty values render “—”. */
export function Kv({ rows }: { rows: Array<[string, ReactNode, { mono?: boolean }?]> }) {
  return (
    <div className="ta-kvwrap">
      <KV rows={rows.map(([k, v, o]) => [k, v == null || v === "" ? <span className="ta-faint">—</span> : v, o ?? {}] as [string, ReactNode, { mono?: boolean }])} />
    </div>
  );
}

export function Prose({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className ? `ta-prose ${className}` : "ta-prose"}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="ta-prose" aria-hidden="true">
      <span className="ta-sk" style={{ width: "70%", display: "block", marginBottom: 10 }} />
      <span className="ta-sk" style={{ width: "100%", display: "block", marginBottom: 10 }} />
      <span className="ta-sk" style={{ width: "85%", display: "block" }} />
    </div>
  );
}
