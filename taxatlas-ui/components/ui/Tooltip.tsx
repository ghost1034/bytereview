import { useId, useState, type ReactNode } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";

/** Hover/focus tooltip. Wraps its child in an inline-flex span; content is plain text or small inline nodes. */
export function Tooltip({ content, children, side = "bottom", className }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom"; className?: string }) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <span className={cn("relative inline-flex", className)} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)} onFocus={() => setShow(true)} onBlur={() => setShow(false)} aria-describedby={show ? id : undefined}>
      {children}
      {show && (
        <span role="tooltip" id={id} className={cn("tooltip left-1/2 -translate-x-1/2", side === "bottom" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]")}>
          {content}
        </span>
      )}
    </span>
  );
}
