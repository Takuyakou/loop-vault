import { Fragment } from "react";
import { useEchoFramed } from "./EchoPracticeFrame";
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
  const framed=useEchoFramed();
  // P23-28 F2: inside the frame the top band carries the name, the badge and the sentence; the header is not drawn.
  if (framed) return null;
  return (
    <div className="bass-echo-task flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="lv-section-kicker">{kicker}</p>
        <h2 className="mt-1 text-2xl font-bold text-[var(--lv-text)]">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--lv-text-secondary)]">
          {description}
        </p>
      </div>
      {!framed ? <Badge tone="indigo" className="w-fit">{badge}</Badge> : null}
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
  // P23-28 F3: a numbered flow — a 22px circle and the name; a thin stretched line between the steps.
  // The lines are empty <li>s (no text), so the step names stay the only text in the list.
  return (
    <ol className="bass-echo-steps" data-count={steps.length} aria-label={ariaLabel}>
      {steps.map((step, index) => (
        <Fragment key={step}>
          {index > 0 ? <li className="bass-echo-line" data-filled={index <= currentIndex ? "true" : undefined} aria-hidden="true" /> : null}
          <li
            className="bass-echo-step"
            data-state={index === currentIndex ? "current" : index < currentIndex ? "done" : "todo"}
            aria-current={index === currentIndex ? "step" : undefined}
          >
            <span className="bass-echo-step-no" data-no={index + 1} aria-hidden="true" />
            <span className="bass-echo-step-name">{step}</span>
          </li>
        </Fragment>
      ))}
    </ol>
  );
}
