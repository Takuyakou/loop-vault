import { Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./ui";
import "./problemPanel.css";

export type ProblemTone = "warning" | "error" | "accent";

const MARK_ICON = {
  warning: TriangleAlert,
  error: TriangleAlert,
  accent: Info,
} as const;

/**
 * P23-30 P1: one panel for every "something went wrong" screen — a mark, the title, one line, then
 * what happened / the data / what to do next, the caller's own controls, and the details folded away.
 */
export function ProblemPanel({
  tone,
  title,
  description,
  what,
  data,
  next,
  dataSafe = true,
  details,
  compact = false,
  children,
  labelledBy,
  testId = "problem-panel",
}: {
  readonly tone: ProblemTone;
  readonly title: string;
  readonly description: string;
  readonly what: string;
  readonly data: string;
  readonly next: string;
  /** True when the sentence under 「データは」 says the data is intact (drawn in the success colour). */
  readonly dataSafe?: boolean;
  /** The path or error text for 「詳しい情報」. Left out when there is nothing to show. */
  readonly details?: string;
  /** P8: the small form — full width, a 32px mark, the three rows only. */
  readonly compact?: boolean;
  readonly children?: ReactNode;
  readonly labelledBy?: string;
  readonly testId?: string;
}) {
  const Mark = MARK_ICON[tone];
  return (
    <section
      className="problem-panel"
      data-tone={tone}
      data-compact={compact || undefined}
      data-testid={testId}
      aria-labelledby={labelledBy}
    >
      <div className="problem-panel-head">
        <span className="problem-panel-mark" aria-hidden="true">{compact ? <Mark size={16} /> : <Mark size={20} />}</span>
        <div className="problem-panel-heading">
          <h2 className="problem-panel-title">{title}</h2>
          {compact ? null : <p className="problem-panel-desc">{description}</p>}
        </div>
      </div>
      <dl className="problem-panel-rows">
        <div><dt>何が起きたか</dt><dd>{what}</dd></div>
        <div><dt>データは</dt><dd data-safe={dataSafe ? "true" : undefined}>{data}</dd></div>
        <div><dt>次にすること</dt><dd>{next}</dd></div>
      </dl>
      {children ? <div className="problem-panel-body">{children}</div> : null}
      {details ? (
        <details className="problem-panel-details">
          <summary>詳しい情報（問い合わせのとき用）</summary>
          <p>{details}</p>
        </details>
      ) : null}
    </section>
  );
}

/**
 * P23-30 P4: one backup row — the readable date, what kind of backup it is, and 「これに戻す」.
 * The newest row (the caller puts it first) is the filled button and carries 「いちばん新しい」.
 */
export function ProblemBackupRow({
  date,
  sub,
  newest = false,
  actionLabel,
  onRestore,
  disabled = false,
}: {
  readonly date: string;
  readonly sub: string;
  readonly newest?: boolean;
  readonly actionLabel: string;
  readonly onRestore: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <li className="problem-backup" data-newest={newest || undefined}>
      <div className="problem-backup-text">
        <span className="problem-backup-date">{date}</span>
        <span className="problem-backup-sub">{sub}</span>
      </div>
      {newest ? <span className="problem-backup-newest">いちばん新しい</span> : null}
      <Button
        variant={newest ? "primary" : "ghost"}
        size="sm"
        aria-label={actionLabel}
        disabled={disabled}
        onClick={onRestore}
      >
        これに戻す
      </Button>
    </li>
  );
}
