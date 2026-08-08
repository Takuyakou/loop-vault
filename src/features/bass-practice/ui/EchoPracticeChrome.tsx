import { Badge } from "../../../components/ui";

export function EchoPracticeHeader({
  badge,
  description,
  kicker,
  title,
}: {
  readonly badge: string;
  readonly description: string;
  readonly kicker: string;
  readonly title: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="lv-section-kicker">{kicker}</p>
        <h2 className="mt-1 text-2xl font-bold text-[var(--lv-text)]">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--lv-text-secondary)]">
          {description}
        </p>
      </div>
      <Badge tone="indigo" className="w-fit">{badge}</Badge>
    </div>
  );
}

export function EchoPracticeProgress({
  ariaLabel,
  currentIndex,
  steps,
}: {
  readonly ariaLabel: string;
  readonly currentIndex: number;
  readonly steps: readonly string[];
}) {
  return (
    <ol className={`grid gap-1 ${steps.length > 4 ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-4"}`} aria-label={ariaLabel}>
      {steps.map((step, index) => (
        <li
          key={step}
          className={`rounded-[var(--lv-radius-sm)] border px-2 py-2 text-center text-[11px] font-semibold ${index === currentIndex ? "border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] text-[var(--lv-accent)]" : index < currentIndex ? "border-[var(--lv-success)] text-[var(--lv-success)]" : "border-[var(--lv-border)] text-[var(--lv-text-muted)]"}`}
          aria-current={index === currentIndex ? "step" : undefined}
        >
          {step}
        </li>
      ))}
    </ol>
  );
}
