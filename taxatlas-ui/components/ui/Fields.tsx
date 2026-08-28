import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";

/** Label above control, sentence case. `required` adds a mono `*`; `help`/`error` render below. */
export function Field({
  label,
  children,
  className,
  required,
  help,
  error,
  trailing,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  required?: boolean;
  help?: ReactNode;
  error?: ReactNode;
  /** Right-aligned control in the label row (e.g. the password "Show" toggle). */
  trailing?: ReactNode;
}) {
  return (
    <label className={cn("field", className)}>
      <span className="field-label">
        <span>
          {label}
          {required && (
            <span className="req" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </span>
        {trailing && <span className="ml-auto">{trailing}</span>}
      </span>
      {children}
      {error ? <span className="field-error">{error}</span> : help ? <span className="field-help">{help}</span> : null}
    </label>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  invalid?: boolean;
  /** `lg` = 34 px (auth pages). */
  size?: "md" | "lg";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, size = "md", ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn("input", size === "lg" && "input-lg", className)} {...rest} />;
});

export function Textarea({ className, invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} className={cn("input", className)} {...rest} />;
}

export function Select({
  className,
  options,
  placeholder,
  invalid,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { options: Array<{ value: string; label: string }>; placeholder?: string; invalid?: boolean }) {
  return (
    <select aria-invalid={invalid || undefined} className={cn("input", className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Password input with a text "Show"/"Hide" toggle (no eye icon). Use inside <Field trailing={...}> or standalone. */
export function PasswordField({
  label,
  help,
  error,
  required,
  className,
  invalid,
  ...rest
}: Omit<InputProps, "type"> & { label: ReactNode; help?: ReactNode; error?: ReactNode; required?: boolean }) {
  const [show, setShow] = useState(false);
  const id = useId();
  return (
    <div className={cn("field", className)}>
      <span className="field-label">
        <label htmlFor={id}>
          {label}
          {required && (
            <span className="req" aria-hidden="true">
              {" "}
              *
            </span>
          )}
        </label>
        <button type="button" className="ml-auto text-xs text-ink-3 hover:text-ink-1" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-controls={id}>
          {show ? "Hide" : "Show"}
        </button>
      </span>
      <Input id={id} type={show ? "text" : "password"} invalid={invalid || !!error} required={required} {...rest} />
      {error ? <span className="field-error">{error}</span> : help ? <span className="field-help">{help}</span> : null}
    </div>
  );
}

/** Search field (260 px default). Pass `kbd` to show a right-aligned key hint such as "/". */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
  kbd,
  inputRef,
  ariaLabel = "Search",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  kbd?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  ariaLabel?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 left-2.5 h-3 w-3 -translate-y-1/2 stroke-ink-3" fill="none" strokeWidth="1.75">
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
      <input ref={inputRef} className={cn("input w-full pl-7", value ? "pr-7" : kbd ? "pr-9" : "")} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel} />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="absolute top-1/2 right-1.5 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-xs text-ink-3 hover:bg-surface-3 hover:text-ink-1">
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 stroke-current" fill="none" strokeWidth="1.75">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      ) : kbd ? (
        <kbd className="kbd pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2">{kbd}</kbd>
      ) : null}
    </div>
  );
}

/** Switch. Always has an accessible name: `label`, else `ariaLabel`, else `title`. */
export function Toggle({
  checked,
  onChange,
  label,
  ariaLabel,
  disabled,
  title,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : ariaLabel ?? title ?? "Toggle"}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("switch", className)}
    >
      <i aria-hidden="true" />
      {label}
    </button>
  );
}

/** Native checkbox with a sentence-case label. */
export function Checkbox({ checked, onChange, children, className, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm text-ink-2", disabled && "opacity-50", className)}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}
