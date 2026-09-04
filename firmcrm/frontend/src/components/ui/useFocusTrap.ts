/* Focus management shared by Modal, Drawer and the confirm dialogs (DESIGN.md §6.11; records QA P0 #1).
   - On open: focus the first form field in the panel (else `initialFocus`, else the close button, else the panel).
   - Tab / Shift+Tab cycle inside the panel; Escape calls onClose.
   - Only the top-most open overlay handles keys, so a confirm opened from a form modal does not close both.
   - On close: focus returns to the element that was focused when the overlay opened. */
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const FIELD = 'input:not([disabled]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select:not([disabled]), textarea:not([disabled])';

const stack: symbol[] = [];
const isTop = (id: symbol) => stack[stack.length - 1] === id;

export function useFocusTrap(open: boolean, panel: RefObject<HTMLElement>, opts: { onClose: () => void; initialFocus?: RefObject<HTMLElement>; closeButton?: RefObject<HTMLElement> }) {
  const id = useRef<symbol>();
  if (!id.current) id.current = Symbol("overlay");
  const onCloseRef = useRef(opts.onClose);
  onCloseRef.current = opts.onClose;
  const initialRef = useRef(opts.initialFocus);
  initialRef.current = opts.initialFocus;
  const closeRef = useRef(opts.closeButton);
  closeRef.current = opts.closeButton;

  useLayoutEffect(() => {
    if (!open) return;
    const me = id.current!;
    const opener = document.activeElement as HTMLElement | null;
    stack.push(me);
    // Initial focus (next frame so the panel has painted and autofocus/refs are attached).
    const raf = requestAnimationFrame(() => {
      const el = panel.current;
      if (!el) return;
      if (el.contains(document.activeElement) && document.activeElement !== el) return; // a child already took focus (autoFocus)
      const target = initialRef.current?.current ?? el.querySelector<HTMLElement>(FIELD) ?? closeRef.current?.current ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
      target.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (!isTop(me)) return;
      const el = panel.current;
      if (!el) return;
      if (e.key === "Escape") { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== "Tab") return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (nodes.length === 0) { e.preventDefault(); el.focus(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !el.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    // Focus that escapes the panel (e.g. a click on the scrim) is pulled back in.
    const onFocusIn = (e: FocusEvent) => {
      if (!isTop(me)) return;
      const el = panel.current;
      if (el && !el.contains(e.target as Node)) (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn);
      const i = stack.indexOf(me);
      if (i >= 0) stack.splice(i, 1);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open, panel]);

  // Ensure the panel itself can receive focus as a last resort.
  useEffect(() => {
    if (open && panel.current && !panel.current.hasAttribute("tabindex")) panel.current.setAttribute("tabindex", "-1");
  }, [open, panel]);
}
