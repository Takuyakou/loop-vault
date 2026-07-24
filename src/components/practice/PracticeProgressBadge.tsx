import { AlertTriangle, Check } from "lucide-react";
import { practiceProgressState } from "../../domain/practice";
import { transpositionCoverageSummary } from "../../domain/practiceTransposition";
import type { AppLanguage, SavedProgressionBlock } from "../../domain/types";

export function PracticeProgressBadge({
  block,
  language,
  compact = false,
  effectiveKeySignature,
}: {
  block: SavedProgressionBlock;
  language: AppLanguage;
  compact?: boolean;
  effectiveKeySignature?: string;
}) {
  const state = practiceProgressState(
    block,
    localDateString(new Date()),
    effectiveKeySignature,
  );
  if (state === "unstarted") return null;
  const stateText = state === "stale"
    ? language === "ja" ? "進行更新・要確認" : "Progression changed"
    : state === "confirmation-due"
      ? language === "ja" ? "別日確認" : "Confirm another day"
      : state === "provisional"
        ? language === "ja" ? "仮クリア" : "Provisional"
        : `L${block.practice?.confirmedLevel ?? 1}`;
  const coverage = state === "stale"
    ? undefined
    : transpositionCoverageLabel(block, language);
  const label = coverage ? `${stateText} · ${coverage}` : stateText;
  const visibleLabel = compact && coverage
    ? compactTranspositionLabel(block, state, language)
    : compact && state === "confirmed"
      ? `L${block.practice?.confirmedLevel ?? 1}`
      : label;
  return (
    <span
      className={`inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 border px-1.5 py-0.5 text-[10px] leading-tight whitespace-normal ${
        state === "stale"
          ? "border-amber-500 text-amber-200"
          : state === "confirmed"
            ? "border-teal-300 bg-teal-300 text-black"
            : "border-teal-400 text-teal-200"
      }`}
      title={label}
      data-practice-state={state}
    >
      {state === "stale" ? <AlertTriangle aria-hidden="true" className="shrink-0" size={16} /> : null}
      {state === "confirmed" ? <Check aria-hidden="true" className="shrink-0" size={16} /> : null}
      {visibleLabel}
    </span>
  );
}

function compactTranspositionLabel(
  block: SavedProgressionBlock,
  state: ReturnType<typeof practiceProgressState>,
  language: AppLanguage,
): string {
  const summary = transpositionCoverageSummary(block.practice);
  if (!summary) return "";
  const progress = `L${summary.level} ${summary.cleared}/${summary.total}`;
  if (state === "provisional") {
    return language === "ja" ? `${progress} · 仮` : `${progress} · Provisional`;
  }
  if (state === "confirmation-due") {
    return language === "ja" ? `${progress} · 別日確認` : `${progress} · Confirm`;
  }
  return progress;
}

function transpositionCoverageLabel(
  block: SavedProgressionBlock,
  language: AppLanguage,
): string | undefined {
  const count = block.practice?.transposition?.clearedKeyPitchClasses.length;
  if (count === undefined) return undefined;
  const summary = transpositionCoverageSummary(block.practice);
  if (!summary) return undefined;
  return language === "ja"
    ? `L${summary.level} キー ${summary.cleared}/${summary.total}`
    : `L${summary.level} keys ${summary.cleared}/${summary.total}`;
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
