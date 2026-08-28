import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";

/** Anchored popover. Uncontrolled by default; pass `open`/`onOpenChange` to control.
 *  `trigger` receives the open state and the props to spread on the toggle element. */
export function Popover({
  trigger,
  children,
  align = "start",
  open: openProp,
  onOpenChange,
  className,
  panelClassName,
  width,
}: {
  trigger: (api: { open: boolean; toggle: () => void; props: { "aria-haspopup": "dialog"; "aria-expanded": boolean; "aria-controls": string; onClick: () => void } }) => ReactNode;
  children: ReactNode | ((api: { close: () => void }) => ReactNode);
  align?: "start" | "end";
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  className?: string;
  panelClassName?: string;
  width?: number;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (o: boolean) => {
    setOpenState(o);
    onOpenChange?.(o);
  };
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = () => setOpen(!open);
  return (
    <div ref={ref} className={cn("relative inline-flex", className)}>
      {trigger({ open, toggle, props: { "aria-haspopup": "dialog", "aria-expanded": open, "aria-controls": id, onClick: toggle } })}
      {open && (
        <div id={id} role="dialog" className={cn("popover top-[calc(100%+4px)]", align === "end" ? "right-0" : "left-0", panelClassName)} style={width ? { width } : undefined}>
          {typeof children === "function" ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  );
}
