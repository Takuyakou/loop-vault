import { forwardRef, type ButtonHTMLAttributes } from "react";

export interface TransportButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: "primary" | "neutral" | "loop";
  active?: boolean;
  fixedPrimary?: boolean;
}

/** Shared action colors. Playback states never borrow diagnostic warning/error colors. */
export const TransportButton = forwardRef<HTMLButtonElement, TransportButtonProps>(
  function TransportButton({ variant, active = false, fixedPrimary = false, className = "",
    type = "button", ...props }, ref) {
    const family = variant === "loop" ? (active ? "loop-on" : "loop-off") : variant;
    return <button {...props} ref={ref} type={type} data-transport-variant={family}
      className={`lv-transport-button lv-transport-${family}${fixedPrimary ? " lv-transport-primary-fixed" : ""} ${className}`} />;
  },
);
