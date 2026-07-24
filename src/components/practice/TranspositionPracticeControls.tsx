import { useRef } from "react";
import type { AppLanguage } from "../../domain/types";
import {
  formatKeySignature,
  getCanonicalKey,
  type TranspositionEligibilityReason,
  type TranspositionSessionState,
} from "../../domain/practiceTransposition";

interface TranspositionPracticeControlsProps {
  state: TranspositionSessionState;
  language: AppLanguage;
  manualSelectionDisabled: boolean;
  targetTempo: number;
  onSelectKey(pitchClass: number): void;
}

const copy = {
  ja: {
    targetKey: "今回のキー",
    progress: "キー進捗",
    progressCount: (cleared: number, total: number) => `${cleared} / ${total}`,
    l4Description: "5度圏で近い6キーを、元の進行と同じ度数で練習します。",
    l5Description: "同じメジャー／マイナーの全12キーで練習します。",
    eligible: "段位対象",
    ineligible: "段位対象外",
    reasons: {
      "flow-required": "正式な進捗にはフローモードが必要です。",
      "target-tempo-required": (tempo: number) => `正式な進捗には${tempo} BPM以上が必要です。`,
      "resolved-voicing-required": "正式な進捗は保存ボイシングのみ対象です。",
      "prerequisite-required": "前の段位の確定が必要です。",
      "progression-stale": "進行が変更されているため、進捗の再同期が必要です。",
    },
    current: "練習中",
    cleared: "このセッションでクリア",
    untried: "未挑戦",
    select: (key: string) => `${key}を練習する`,
    runningHint: "キーを変更するには、いったん練習を停止してください。",
  },
  en: {
    targetKey: "Target key",
    progress: "Key progress",
    progressCount: (cleared: number, total: number) => `${cleared} / ${total}`,
    l4Description: "Practice the same degrees in six nearby circle-of-fifths keys.",
    l5Description: "Practice in all 12 keys while keeping the same major or minor mode.",
    eligible: "Rank eligible",
    ineligible: "Not rank eligible",
    reasons: {
      "flow-required": "Official progress requires Flow mode.",
      "target-tempo-required": (tempo: number) => `Official progress requires at least ${tempo} BPM.`,
      "resolved-voicing-required": "Official progress requires Saved voicing.",
      "prerequisite-required": "Confirm the previous level first.",
      "progression-stale": "The progression changed and its progress must be resynced.",
    },
    current: "Current",
    cleared: "Cleared this session",
    untried: "Not attempted",
    select: (key: string) => `Practice in ${key}`,
    runningHint: "Pause practice before changing the target key.",
  },
} as const;

export function TranspositionPracticeControls({
  state,
  language,
  manualSelectionDisabled,
  targetTempo,
  onSelectKey,
}: TranspositionPracticeControlsProps) {
  const text = copy[language];
  const keyButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const targetKey = getCanonicalKey(
    state.currentTargetKeyPitchClass,
    state.sourceMode,
  );
  return (
    <section
      className="border-b border-[var(--lv-border)] py-4"
      data-testid="transposition-practice-controls"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--lv-text-muted)]">
            {text.targetKey}
          </p>
          <h3
            className="mt-1 text-2xl font-semibold text-[var(--lv-text)]"
            data-testid="transposition-target-key"
            aria-live="polite"
          >
            {formatKeySignature(targetKey, language)}
          </h3>
        </div>
        <div className="text-right">
          <span
            className={`inline-flex border px-2 py-1 text-xs font-semibold ${
              state.officialProgressEligible
                ? "border-teal-700 text-teal-200"
                : "border-amber-700 text-amber-200"
            }`}
            data-testid="transposition-eligibility"
          >
            {state.officialProgressEligible ? text.eligible : text.ineligible}
          </span>
          {!state.officialProgressEligible ? (
            <ul
              className="mt-1 space-y-0.5 text-xs text-[var(--lv-text-muted)]"
              data-testid="transposition-eligibility-reasons"
            >
              {state.eligibilityReasons.map((reason) => (
                <li key={reason}>{eligibilityReason(reason, targetTempo, text)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-[var(--lv-text-muted)]">
            {text.progress}
          </p>
          <span
            className="text-xs font-semibold text-[var(--lv-accent)]"
            data-testid="transposition-progress-count"
          >
            {text.progressCount(
              state.sessionClearedPitchClasses.length,
              state.keyPool.length,
            )}
          </span>
        </div>
        <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
          {state.level === 4 ? text.l4Description : text.l5Description}
        </p>
        <div
          className="mt-2 grid gap-1.5"
          style={{
            gridTemplateColumns: "repeat(auto-fit, minmax(5.5rem, 1fr))",
          }}
          data-testid="transposition-key-rail"
          role="group"
          aria-label={text.progress}
        >
          {state.keyPool.map((pitchClass, index) => {
            const key = getCanonicalKey(pitchClass, state.sourceMode);
            const label = formatKeySignature(key, language);
            const current = pitchClass === state.currentTargetKeyPitchClass;
            const cleared = state.sessionClearedPitchClasses.includes(pitchClass);
            const status = current ? text.current : cleared ? text.cleared : text.untried;
            return (
              <button
                key={pitchClass}
                type="button"
                aria-pressed={current}
                tabIndex={current ? 0 : -1}
                ref={(element) => {
                  keyButtonRefs.current[index] = element;
                }}
                className={keyButtonClass(current, cleared)}
                data-key-pitch-class={pitchClass}
                data-key-state={current ? "current" : cleared ? "cleared" : "untried"}
                aria-current={current ? "step" : undefined}
                aria-label={`${text.select(label)}: ${status}`}
                title={manualSelectionDisabled ? text.runningHint : text.select(label)}
                disabled={manualSelectionDisabled}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  const direction = event.key === "ArrowLeft" ? -1 : 1;
                  const nextIndex = (
                    index + direction + state.keyPool.length
                  ) % state.keyPool.length;
                  keyButtonRefs.current[nextIndex]?.focus();
                }}
                onClick={() => onSelectKey(pitchClass)}
              >
                <span className="block truncate text-sm font-semibold">{label}</span>
                <span className="mt-1 block truncate text-[10px] text-[var(--lv-text-muted)]">
                  {status}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function eligibilityReason(
  reason: TranspositionEligibilityReason,
  targetTempo: number,
  text: typeof copy.ja | typeof copy.en,
): string {
  return reason === "target-tempo-required"
    ? text.reasons[reason](targetTempo)
    : text.reasons[reason];
}

function keyButtonClass(current: boolean, cleared: boolean): string {
  const base = "min-w-0 border px-2 py-2 text-left disabled:cursor-not-allowed";
  if (current) return `${base} border-teal-300 bg-teal-950/40`;
  if (cleared) return `${base} border-teal-800 bg-teal-950/20`;
  return `${base} border-[var(--lv-border)] bg-[var(--lv-surface)]`;
}
