import { X } from "lucide-react";
import { IconButton, type StatusTone } from "./ui";

export interface ToastProps {
  message: string;
  title?: string;
  tone?: StatusTone;
  action?: {
    label: string;
    onClick: () => void;
  };
  onDismiss?: () => void;
  dismissLabel?: string;
}

export function Toast({
  action,
  dismissLabel = "Dismiss",
  message,
  onDismiss,
  title,
  tone = "info",
}: ToastProps) {
  return (
    <div
      className={`lv-status-${tone} fixed right-4 top-4 z-[var(--lv-z-toast)] flex w-[min(24rem,calc(100vw-2rem))] gap-3 border p-4 text-sm text-[var(--lv-text)] shadow-[var(--lv-shadow-overlay)]`}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      data-toast-tone={tone}
    >
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        <p className={`${title ? "mt-1 " : ""}break-words leading-6 text-[var(--lv-text-secondary)]`}>{message}</p>
        {action ? (
          <button type="button" className="mt-2 font-semibold text-[var(--lv-accent)] underline-offset-4 hover:underline" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
      {onDismiss ? (
        <IconButton
          label={dismissLabel}
          variant="ghost"
          size="sm"
          className="-mr-2 -mt-2 shrink-0"
          onClick={onDismiss}
        >
          <X aria-hidden="true" size={18} />
        </IconButton>
      ) : null}
    </div>
  );
}
