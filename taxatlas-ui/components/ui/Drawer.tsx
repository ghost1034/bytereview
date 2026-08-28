import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";
import { Button } from "./Button";
import { CopyButton } from "./CopyButton";

export type DrawerMode = "overlay" | "push";

/** Right slide-over (components.md §4).
 *  - `mode="overlay"` (default, map): absolutely positioned over the page; non-modal unless `modal`.
 *  - `mode="push"` (list/detail pages): render as the `panel` of `<PageWithPanel>`; content shrinks by --drawer-w.
 *    Below 1280 px push falls back to a fixed overlay automatically (CSS).
 *  Head: `kicker` (mono ID · type · status marker), then `title` (serif when `titleSerif`), `subtitle` under it.
 *  `actions` render as ghost text buttons left of the icon buttons; `copyLink` adds a "Copy link" icon button.
 *  `footer` renders the 48 px foot (primary action left, row navigation right). */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  kicker,
  titleSerif,
  children,
  width,
  modal = false,
  mode = "overlay",
  actions,
  footer,
  copyLink,
  ariaLabel,
  className,
  closeOnEscape = true,
  chrome = true,
  initialFocus = "first",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  kicker?: ReactNode;
  titleSerif?: boolean;
  children: ReactNode;
  /** @deprecated width is --drawer-w; pass a CSS width string to override. */
  width?: string;
  modal?: boolean;
  mode?: DrawerMode;
  actions?: ReactNode;
  footer?: ReactNode;
  /** URL to copy with the "Copy link" icon button (defaults to the current URL when `true`). */
  copyLink?: string | boolean;
  ariaLabel?: string;
  className?: string;
  /** Set false when the page handles Esc itself (e.g. the map's two-stage Esc). */
  closeOnEscape?: boolean;
  /** Set false to render only the aside shell; children provide their own head/body/foot markup. */
  chrome?: boolean;
  /** "first" focuses the first control on open (default); "panel" focuses the aside itself (tabIndex −1) so no
   *  control shows a focus ring when the drawer opens from a pointer action, e.g. clicking a country on the map. */
  initialFocus?: "first" | "panel";
}) {
  const panelRef = useRef<HTMLElement | null>(null);

  // Esc closes; Tab is trapped only when modal; focus moves into the panel on open and returns on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
    const raf = requestAnimationFrame(() => {
      const first =
        initialFocus === "panel"
          ? panelRef.current
          : (focusables().find((el) => !el.hasAttribute("data-drawer-close")) ?? focusables()[0] ?? panelRef.current);
      first?.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!closeOnEscape) return;
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !modal) return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!panelRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, onClose, modal, closeOnEscape, initialFocus]);

  if (!open) return null;
  const label = ariaLabel ?? (typeof title === "string" ? title : undefined);
  const style =
    width && !width.startsWith("w-")
      ? ({ width } as React.CSSProperties)
      : undefined;
  return (
    <>
      {modal && <div className="scrim" onClick={onClose} aria-hidden="true" />}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal={modal || undefined}
        aria-label={label}
        tabIndex={-1}
        className={cn(
          "drawer",
          mode === "push" ? "drawer-push" : "drawer-overlay",
          className,
        )}
        style={style}
      >
        {!chrome ? (
          children
        ) : (
          <>
            <div className="drawer-head">
              <div className="row">
                <div className="min-w-0 flex-1">
                  {kicker && <div className="drawer-sub">{kicker}</div>}
                  {title && (
                    <h2 className={cn("drawer-title", titleSerif && "serif")}>
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <div className="drawer-sub mt-1.5 mb-0">{subtitle}</div>
                  )}
                </div>
                <div className="actions">
                  {actions}
                  {copyLink && (
                    <CopyButton
                      text={
                        typeof copyLink === "string"
                          ? copyLink
                          : window.location.href
                      }
                      label="Copy link"
                      size="sm"
                      variant="ghost"
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    aria-label="Close"
                    title="Close"
                    data-drawer-close
                    onClick={onClose}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </Button>
                </div>
              </div>
            </div>
            <div className="drawer-body">{children}</div>
            {footer && <div className="drawer-foot">{footer}</div>}
          </>
        )}
      </aside>
    </>
  );
}

/** Hairline-separated section with a caps title. */
export function DrawerSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("drawer-section", className)}>
      {title && <h3 className="section-title">{title}</h3>}
      <div className="text-sm leading-relaxed text-ink-1">{children}</div>
    </section>
  );
}

/** Definition list: 120 px ink-3 label column; pass `mono` per row for numeric/code values. */
export function KV({
  rows,
  className,
}: {
  rows: Array<[string, ReactNode] | [string, ReactNode, { mono?: boolean }]>;
  className?: string;
}) {
  return (
    <dl className={cn("kv", className)}>
      {rows.map(([k, v, opts]) => (
        <div key={k} className="contents">
          <dt>{k}</dt>
          <dd className={opts?.mono ? "mono" : undefined}>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Layout for list/detail pages that host a push-mode drawer. `panel` is typically a `<Drawer mode="push">`. */
export function PageWithPanel({
  children,
  panel,
  className,
}: {
  children: ReactNode;
  panel?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("page-with-panel", className)}>
      <div className="pwp-content">{children}</div>
      {panel}
    </div>
  );
}
