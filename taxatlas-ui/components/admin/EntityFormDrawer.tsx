/* Admin create/edit form in a modal overlay panel (components.md §10 forms, §14 danger + confirm). Props unchanged. */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError } from "@/taxatlas-ui/lib/api";
import { DetailPanel } from "@/taxatlas-ui/components/detail/DetailPanel";
import { errorMessage } from "@/taxatlas-ui/components/ui/Toast";
import "@/taxatlas-ui/components/detail/lists.css";

export type FieldType = "text" | "textarea" | "number" | "date" | "select" | "url" | "tags" | "checkbox";

export interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  /** Render at half width (two per row). */
  half?: boolean;
  mono?: boolean;
  help?: string;
  /** Only editable on create (e.g. natural keys). */
  createOnly?: boolean;
  step?: string;
}

export type FormValues = Record<string, unknown>;

/** Convert a form value to an API value: blanks → null, numbers parsed, tags split, checkbox boolean. */
function toApiValue(spec: FieldSpec, v: unknown): unknown {
  if (spec.type === "checkbox") return Boolean(v);
  if (v === undefined || v === null) return null;
  const str = String(v).trim();
  if (str === "") return null;
  if (spec.type === "number") return Number(str);
  if (spec.type === "tags") return str.split(",").map((t) => t.trim()).filter(Boolean);
  return str;
}

/** Convert an API/entity value into the editable form representation. */
function toFormValue(spec: FieldSpec, v: unknown): unknown {
  if (spec.type === "checkbox") return Boolean(v);
  if (v === undefined || v === null) return "";
  if (spec.type === "tags" && Array.isArray(v)) return v.join(", ");
  return String(v);
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  mode: "create" | "edit";
  fields: FieldSpec[];
  initial: FormValues;
  /** Receives API-ready values: all fields for create; only changed fields (+ reason) for edit. */
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>;
  /** Enables the Delete action (edit mode). Receives the reason text. */
  onDelete?: (reason: string) => Promise<unknown>;
  submitLabel?: string;
  note?: string;
  /** Ask for a reason (stored on the audit ChangeEvent). Default: true for edit. */
  withReason?: boolean;
  /** Name of the object, repeated in the delete confirmation. */
  objectName?: string;
}

export function EntityFormDrawer({ open, onClose, title, subtitle, mode, fields, initial, onSubmit, onDelete, submitLabel, note, withReason = mode === "edit", objectName }: Props) {
  const visible = useMemo(() => fields.filter((f) => mode === "create" || !f.createOnly), [fields, mode]);
  const initialForm = useMemo(() => Object.fromEntries(visible.map((f) => [f.key, toFormValue(f, initial[f.key])])), [visible, initial]);
  const [form, setForm] = useState<FormValues>(initialForm);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setForm(initialForm);
      setReason("");
      setError(null);
      setConfirmDelete(false);
      setTouched({});
    }
  }, [open, initialForm]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const isMissing = (f: FieldSpec) => !!f.required && (form[f.key] === "" || form[f.key] == null);
  const missing = visible.filter(isMissing).map((f) => f.label);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const body: Record<string, unknown> = {};
    visible.forEach((f) => {
      const v = toApiValue(f, form[f.key]);
      if (mode === "create") {
        if (v !== null) body[f.key] = v;
      } else if (form[f.key] !== initialForm[f.key]) {
        body[f.key] = v;
      }
    });
    if (mode === "edit" && Object.keys(body).length === 0) {
      setError("No changes to save.");
      return;
    }
    if (withReason && reason.trim()) body.reason = reason.trim();
    setPending(true);
    try {
      await onSubmit(body);
      onClose();
    } catch (ex) {
      setError(ex instanceof ApiError ? `${ex.status}: ${ex.detail}` : errorMessage(ex));
    } finally {
      setPending(false);
    }
  };

  const doDelete = async () => {
    if (!onDelete) return;
    setPending(true);
    setError(null);
    try {
      await onDelete(reason.trim());
      onClose();
    } catch (ex) {
      setError(ex instanceof ApiError ? `${ex.status}: ${ex.detail}` : errorMessage(ex));
    } finally {
      setPending(false);
    }
  };

  return (
    <DetailPanel
      mode="overlay"
      modal
      wide
      open={open}
      onClose={onClose}
      label={title}
      idLine={subtitle ? <span className="code">{subtitle}</span> : undefined}
      title={title}
      copyLink={false}
      foot={
        <>
          {onDelete && mode === "edit" && !confirmDelete && (
            <button type="button" className="btn btn-ghost btn-danger" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
          {onDelete && confirmDelete && (
            <span className="ta-confirm">
              Delete <span className="code">{objectName ?? title}</span> permanently{reason.trim() ? "" : " (add a reason first)"}?
              <button type="button" className="btn btn-sm btn-danger" disabled={pending || !reason.trim()} onClick={doDelete}>
                Confirm delete
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          )}
          <span className="spacer" />
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="ta-entity-form" className="btn btn-primary" aria-busy={pending || undefined} disabled={pending || missing.length > 0} title={missing.length ? `Required: ${missing.join(", ")}` : undefined}>
            {submitLabel ?? (mode === "create" ? "Create" : "Save changes")}
          </button>
        </>
      }
    >
      <form id="ta-entity-form" onSubmit={submit} className="ta-form" aria-label={title}>
        {note && <p className="ta-note" style={{ margin: 0 }}>{note}</p>}
        <div className="grid2">
          {visible.map((f) => {
            const id = `f-${f.key}`;
            const v = form[f.key];
            const showErr = touched[f.key] && isMissing(f);
            const inputCls = ["ta-input", f.mono ? "mono" : "", showErr ? "err" : ""].filter(Boolean).join(" ");
            return (
              <div key={f.key} className={f.half ? "ta-field" : "ta-field full"}>
                {f.type !== "checkbox" && (
                  <label className="ta-label" htmlFor={id}>
                    {f.label}
                    {f.required && <span className="req" aria-hidden="true">*</span>}
                  </label>
                )}
                {f.type === "textarea" ? (
                  <textarea id={id} className={inputCls} required={f.required} placeholder={f.placeholder} value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))} />
                ) : f.type === "select" ? (
                  <select id={id} className={inputCls} required={f.required} value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}>
                    <option value="">{f.required ? "Select…" : "—"}</option>
                    {(f.options ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.type === "checkbox" ? (
                  <label className="ta-check" htmlFor={id}>
                    <input id={id} type="checkbox" checked={Boolean(v)} onChange={(e) => set(f.key, e.target.checked)} />
                    {f.label}
                    {f.help && <span className="ta-help">· {f.help}</span>}
                  </label>
                ) : (
                  <input
                    id={id}
                    className={inputCls}
                    required={f.required}
                    placeholder={f.placeholder}
                    type={f.type === "tags" ? "text" : f.type}
                    step={f.step ?? (f.type === "number" ? "any" : undefined)}
                    value={String(v ?? "")}
                    onChange={(e) => set(f.key, e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}
                  />
                )}
                {showErr ? <span className="ta-help" style={{ color: "var(--negative)" }}>Required.</span> : f.help && f.type !== "checkbox" ? <span className="ta-help">{f.help}</span> : null}
              </div>
            );
          })}
          {withReason && (
            <div className="ta-field full">
              <label className="ta-label" htmlFor="f-reason">Reason (audit trail)</label>
              <input id="f-reason" className="ta-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this change is being made — stored on the change event" maxLength={500} />
            </div>
          )}
        </div>
        {error && (
          <div role="alert" className="ta-alert">
            {error}
          </div>
        )}
      </form>
    </DetailPanel>
  );
}
