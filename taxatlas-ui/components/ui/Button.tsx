import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/taxatlas-ui/lib/utils";

/** `primary` = brass (one per view) · `default`/`secondary` = surface-2 with hairline · `ghost` = transparent · `danger` = ghost with negative text. */
export type ButtonVariant = "primary" | "default" | "secondary" | "ghost" | "danger";
/** Heights: xs 24 · sm 26 · md 28 (default) · lg 34 (auth pages). */
export type ButtonSize = "xs" | "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Busy state: label stays, a 1 px progress line runs along the bottom edge, button is disabled. */
  loading?: boolean;
  /** Square icon-only button. Requires `aria-label`. */
  iconOnly?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  default: "",
  secondary: "",
  ghost: "btn-ghost",
  danger: "btn-danger",
};
const sizes: Record<ButtonSize, string> = { xs: "btn-xs", sm: "btn-sm", md: "", lg: "btn-lg" };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", loading, iconOnly, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn("btn", variants[variant], sizes[size], iconOnly && "btn-icon", className)}
      {...rest}
    >
      {children}
    </button>
  );
});
