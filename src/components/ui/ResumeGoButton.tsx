import type { ButtonHTMLAttributes } from "react";

/**
 * P24-02 I-1: one 「続ける Enter」 button for the three homes.
 *
 * The three screens used to carry their own button and Enter badge, and each screen's own rules won at
 * different window sizes, so the same button looked different on each. This is the only markup; the
 * accent colour is the one variable the screens still set (`--lv-resume-accent` / `--lv-resume-on-accent`).
 * The badge is a `span`, never a `kbd`: the Tailwind base styles give `kbd` a monospace face.
 */
export interface ResumeGoButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "className" | "children"> {
  readonly label: string;
}

export function ResumeGoButton({ label, ...rest }: ResumeGoButtonProps) {
  return (
    <button type="button" className="lv-resume-go" {...rest}>
      {label}
      <span className="lv-resume-go-key" aria-hidden="true">Enter</span>
    </button>
  );
}
