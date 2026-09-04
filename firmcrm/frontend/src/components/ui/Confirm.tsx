/* Confirm + reason dialogs replacing window.confirm()/prompt() (DESIGN.md §6.11; records QA P0 #2).
   Usage:
     const confirm = useConfirm();
     if (!(await confirm({ title: "Archive this account?", body: "Open opportunities stay visible; the account leaves lists.", confirmLabel: "Archive" }))) return;

     const reason = useReasonPrompt();
     const text = await reason({ title: "Mark unqualified", label: "Reason", required: true }); // null when cancelled */
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Field, Modal, Textarea } from "./index";

export type ConfirmOptions = {
  title: string;
  /** One sentence. */
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` (default) renders a danger-solid confirm; `primary` for non-destructive gates (e.g. "Create anyway"). */
  tone?: "danger" | "primary";
};
export type ReasonOptions = {
  title: string;
  label: string;
  hint?: string;
  placeholder?: string;
  /** Blocks confirm until the text is non-empty. */
  required?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  initialValue?: string;
};

/** Presentational confirm dialog (§6.11): title sand-900, one-sentence body, danger-solid confirm + secondary cancel. Focus starts on Cancel. */
export function ConfirmDialog({ open, title, body, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "danger", onConfirm, onCancel, busy }: ConfirmOptions & { open: boolean; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal open={open} onClose={onCancel} title={title} initialFocus={cancelRef} hideClose
           footer={<>
             <Button ref={cancelRef} onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
             <Button variant={tone === "danger" ? "danger-solid" : "primary"} onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
           </>}>
      {body ? <p className="text-[13px] leading-5 text-sand-700">{body}</p> : <p className="text-[13px] leading-5 text-sand-700">This action cannot be undone.</p>}
    </Modal>
  );
}

/** Small modal with a single Textarea; resolves with the text or null. */
export function ReasonDialog({ open, title, label, hint, placeholder, required = false, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "primary", initialValue = "", onConfirm, onCancel }: ReasonOptions & { open: boolean; onConfirm: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initialValue);
  const [touched, setTouched] = useState(false);
  const id = useId();
  useEffect(() => { if (open) { setText(initialValue); setTouched(false); } }, [open, initialValue]);
  const empty = text.trim().length === 0;
  const err = required && touched && empty ? `${label} is required.` : undefined;
  const submit = () => { if (required && empty) { setTouched(true); return; } onConfirm(text.trim()); };
  return (
    <Modal open={open} onClose={onCancel} title={title}
           footer={<>
             <Button onClick={onCancel}>{cancelLabel}</Button>
             <Button variant={tone === "danger" ? "danger-solid" : "primary"} onClick={submit} disabled={required && empty}>{confirmLabel}</Button>
           </>}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label={label + (required ? " *" : "")} hint={hint} error={err} errorId={`${id}-error`}>
          <Textarea id={id} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => setTouched(true)} placeholder={placeholder} rows={3}
                    aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-error` : undefined}
                    onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(); } }} />
        </Field>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Provider */
type Pending =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: "reason"; opts: ReasonOptions; resolve: (text: string | null) => void };
type Ctx = { confirm: (o: ConfirmOptions) => Promise<boolean>; reason: (o: ReasonOptions) => Promise<string | null> };
const ConfirmCtx = createContext<Ctx | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ kind: "confirm", opts, resolve })), []);
  const reason = useCallback((opts: ReasonOptions) => new Promise<string | null>((resolve) => setPending({ kind: "reason", opts, resolve })), []);
  const value = useMemo(() => ({ confirm, reason }), [confirm, reason]);
  const settle = (result: boolean | string | null) => {
    if (!pending) return;
    setPending(null);
    if (pending.kind === "confirm") pending.resolve(Boolean(result));
    else pending.resolve(typeof result === "string" ? result : null);
  };
  return (
    <ConfirmCtx.Provider value={value}>
      {children}
      {pending?.kind === "confirm" && <ConfirmDialog open {...pending.opts} onConfirm={() => settle(true)} onCancel={() => settle(false)} />}
      {pending?.kind === "reason" && <ReasonDialog open {...pending.opts} onConfirm={(t) => settle(t)} onCancel={() => settle(null)} />}
    </ConfirmCtx.Provider>
  );
}

/** `const ok = await confirm({ title, body?, confirmLabel?, tone? })` → Promise<boolean>. */
export function useConfirm() {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error("useConfirm outside ConfirmProvider");
  return c.confirm;
}
/** `const text = await reason({ title, label, hint?, placeholder?, required?, confirmLabel? })` → Promise<string | null> (null = cancelled). */
export function useReasonPrompt() {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error("useReasonPrompt outside ConfirmProvider");
  return c.reason;
}
