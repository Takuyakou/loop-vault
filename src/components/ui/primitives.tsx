import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  TriangleAlert,
} from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  className = "",
  type = "button",
  variant = "secondary",
  size = "md",
  ...props
}, ref) {
  const sizeClass = size === "sm"
    ? "min-h-9 px-3 text-xs"
    : "min-h-10 px-4 text-sm";

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-2 font-medium ${sizeClass} lv-button-${variant} ${className}`}
    />
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "children"> {
  label: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  children,
  className = "",
  label,
  title = label,
  ...props
}, ref) {
  return (
    <Button
      {...props}
      ref={ref}
      aria-label={label}
      title={title}
      className={`h-10 min-h-10 w-10 px-0 ${className}`}
    >
      {children}
    </Button>
  );
});

export interface FieldProps {
  children: ReactNode;
  htmlFor: string;
  label: string;
  helper?: string;
  error?: string;
  optionalLabel?: string;
  className?: string;
}

export function Field({
  children,
  className = "",
  error,
  helper,
  htmlFor,
  label,
  optionalLabel,
}: FieldProps) {
  const descriptionId = `${htmlFor}-description`;
  return (
    <div className={className}>
      <label className="flex items-baseline justify-between gap-3 text-sm font-medium text-[var(--lv-text-secondary)]" htmlFor={htmlFor}>
        <span>{label}</span>
        {optionalLabel ? <span className="text-xs font-normal text-[var(--lv-text-muted)]">{optionalLabel}</span> : null}
      </label>
      <div className="mt-2">{children}</div>
      {error ? (
        <p id={descriptionId} className="mt-2 text-xs leading-5 text-[var(--lv-danger)]" role="alert">
          {error}
        </p>
      ) : helper ? (
        <p id={descriptionId} className="mt-2 text-xs leading-5 text-[var(--lv-text-muted)]">
          {helper}
        </p>
      ) : null}
    </div>
  );
}

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

export function Surface({ children, className = "", ...props }: SurfaceProps) {
  return (
    <section {...props} className={`lv-surface ${className}`}>
      {children}
    </section>
  );
}

export type StatusTone = "info" | "success" | "warning" | "error";

export interface StatusMessageProps {
  title: string;
  children?: ReactNode;
  tone?: StatusTone;
  action?: ReactNode;
  className?: string;
}

const statusIcons: Record<StatusTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
};

export function StatusMessage({
  action,
  children,
  className = "",
  title,
  tone = "info",
}: StatusMessageProps) {
  const Icon = statusIcons[tone];
  return (
    <div
      className={`lv-status-${tone} flex min-w-0 gap-3 border p-4 ${className}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[var(--lv-text)]">{title}</p>
        {children ? <div className="mt-1 break-words text-sm leading-6 text-[var(--lv-text-secondary)]">{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  action,
  className = "",
  description,
  icon,
  title,
}: EmptyStateProps) {
  return (
    <div className={`border border-dashed border-[var(--lv-border-strong)] px-5 py-8 text-center ${className}`}>
      {icon ? <div className="mx-auto mb-3 flex w-fit text-[var(--lv-text-muted)]">{icon}</div> : null}
      <h3 className="text-base font-semibold text-[var(--lv-text)]">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--lv-text-secondary)]">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

