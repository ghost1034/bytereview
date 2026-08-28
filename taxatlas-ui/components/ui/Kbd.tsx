import type { ReactNode } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";

/** Keyboard hint. Renders <kbd> (not <code>) so it never collides with code-sample selectors. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("kbd", className)}>{children}</kbd>;
}

export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = IS_MAC ? "⌘" : "Ctrl";
