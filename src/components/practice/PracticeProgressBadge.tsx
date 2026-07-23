import { AlertTriangle, Check } from "lucide-react";
import { practiceProgressState } from "../../domain/practice";
import type { AppLanguage, SavedProgressionBlock } from "../../domain/types";

export function PracticeProgressBadge({
  block,
  language,
  compact = false,
}: {
  block: SavedProgressionBlock;
  language: AppLanguage;
  compact?: boolean;
}) {
  const state = practiceProgressState(block, localDateString(new Date()));
  if (state === "unstarted") return null;
  const label = state === "stale"
    ? language === "ja" ? "進行更新・要確認" : "Progression changed"
    : state === "confirmation-due"
      ? language === "ja" ? "別日確認" : "Confirm another day"
      : state === "provisional"
        ? language === "ja" ? "仮クリア" : "Provisional"
        : `L${block.practice?.confirmedLevel ?? 1}`;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5 text-[10px] ${
        state === "stale"
          ? "border-amber-500 text-amber-200"
          : state === "confirmed"
            ? "border-teal-300 bg-teal-300 text-black"
            : "border-teal-400 text-teal-200"
      }`}
      title={label}
      data-practice-state={state}
    >
      {state === "stale" ? <AlertTriangle aria-hidden="true" size={11} /> : null}
      {state === "confirmed" ? <Check aria-hidden="true" size={11} /> : null}
      {compact && state === "confirmed" ? `L${block.practice?.confirmedLevel ?? 1}` : label}
    </span>
  );
}

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

