import { useState } from "react";
import { copyText } from "@/taxatlas-ui/lib/utils";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";

/** Text button "Copy" → "Copied" for 1.5 s. No icon. */
export function CopyButton({
  text,
  label = "Copy",
  size = "sm",
  variant = "ghost",
  className,
  ariaLabel,
}: {
  text: string;
  label?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  className?: string;
  ariaLabel?: string;
}) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      aria-label={ariaLabel}
      onClick={async () => {
        if (await copyText(text)) {
          setOk(true);
          window.setTimeout(() => setOk(false), 1500);
        }
      }}
    >
      {ok ? "Copied" : label}
    </Button>
  );
}
