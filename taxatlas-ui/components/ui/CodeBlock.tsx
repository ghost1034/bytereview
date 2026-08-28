import { useEffect, useMemo, useState } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";
import { Button } from "./Button";
import { CopyButton } from "./CopyButton";

const MAX_LINES = 20;

/** Code / curl block (components.md §11). Exactly one <code> per block. Comments and `$` prompts render in ink-3.
 *  `secret`: renders the value masked as `ta_••••••••` with a "Reveal" toggle; revealing shows the real value for 30 s. */
export function CodeBlock({
  code,
  label,
  copyText,
  className,
  secret,
  maxLines = MAX_LINES,
  actions,
  copy = true,
}: {
  code: string;
  label?: string;
  /** Text placed on the clipboard (defaults to `code`). */
  copyText?: string;
  className?: string;
  secret?: { value: string; placeholder?: string };
  maxLines?: number;
  actions?: React.ReactNode;
  /** Hide the header "Copy" button (e.g. when another block on the screen already owns the single Copy action). */
  copy?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    if (!revealed) return;
    const t = window.setTimeout(() => setRevealed(false), 30_000);
    return () => window.clearTimeout(t);
  }, [revealed]);

  const shown = useMemo(() => {
    if (!secret) return code;
    const mask = secret.placeholder ?? `${secret.value.slice(0, 3)}••••••••`;
    return revealed ? code : code.split(secret.value).join(mask);
  }, [code, secret, revealed]);

  const lines = shown.split("\n");
  const truncated = lines.length > maxLines;
  const visible = truncated ? lines.slice(0, maxLines) : lines;

  return (
    <div className={cn("codeblock", className)}>
      {(label || actions || secret || copy) && (
        <div className="codeblock-head">
          {label && <span className="lbl">{label}</span>}
          <div className="right">
            {actions}
            {secret && (
              <Button size="xs" variant="ghost" onClick={() => setRevealed((r) => !r)} aria-pressed={revealed}>
                {revealed ? "Mask" : "Reveal"}
              </Button>
            )}
            {copy && <CopyButton text={copyText ?? code} size="xs" />}
          </div>
        </div>
      )}
      <pre>
        <code>
          {visible.map((ln, i) => (
            <span key={i} className={/^\s*(#|\/\/|\$)/.test(ln) ? "cmt" : undefined}>
              {ln}
              {i < visible.length - 1 ? "\n" : ""}
            </span>
          ))}
        </code>
      </pre>
      {truncated && <div className="more">… {lines.length - maxLines} more lines</div>}
    </div>
  );
}
