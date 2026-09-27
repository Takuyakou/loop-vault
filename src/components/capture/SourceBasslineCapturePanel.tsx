import { useId } from "react";
import type { AnalysisSessionVoice } from "../../domain/midi/preAnalysis/types";
import type { SourceBasslineCaptureAssessment } from "../../domain/sourceBassline";

export function SourceBasslineCapturePanel({
  voices,
  selectedVoiceId,
  assessment,
  rangeSelected,
  optedIn,
  onVoiceChange,
  onRangeChange,
  onOptInChange,
}: {
  voices: readonly AnalysisSessionVoice[];
  selectedVoiceId: string;
  assessment: SourceBasslineCaptureAssessment;
  rangeSelected: boolean;
  optedIn: boolean;
  onVoiceChange: (voiceId: string) => void;
  onRangeChange: (selected: boolean) => void;
  onOptInChange: (enabled: boolean) => void;
}) {
  const id = useId();
  const ids = {
    title: `${id}-title`,
    description: `${id}-description`,
    voiceReason: `${id}-voice-reason`,
    rangeReason: `${id}-range-reason`,
    status: `${id}-status`,
  };
  const reason = reasonCopy(assessment.reason);
  const canSelectRange = selectedVoiceId !== "" && assessment.snapshot !== undefined;
  const canOptIn = canSelectRange && rangeSelected;
  return (
    <section
      className="mt-4 min-w-0 border border-[var(--lv-border)] bg-[var(--lv-surface)] p-3"
      aria-labelledby={ids.title}
      data-testid="source-bassline-capture-panel"
    >
      <h3 id={ids.title} className="text-sm font-semibold text-[var(--lv-text)]">
        {"元ベースライン候補"}
      </h3>
      <p id={ids.description} className="mt-1 break-words text-xs text-[var(--lv-text-muted)]">
        {"選んだBass Voiceの実ノートを、元MIDIとは切り離して練習用に保存できます。Voice名やファイル情報は保存しません。"}
      </p>
      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-semibold text-[var(--lv-text-secondary)]">
          {"Bass Voiceを選択"}
          <select
            className="mt-1 block min-h-10 w-full max-w-full rounded border border-[var(--lv-border)] bg-[var(--lv-bg)] px-2 text-sm text-[var(--lv-text)]"
            value={selectedVoiceId}
            disabled={voices.length === 0}
            aria-describedby={`${ids.description} ${ids.voiceReason}`}
            onChange={(event) => onVoiceChange(event.target.value)}
          >
            <option value="">{"選択してください"}</option>
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>{voice.displayName}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs font-semibold text-[var(--lv-text-secondary)]">
          {"保存する範囲"}
          <select
            className="mt-1 block min-h-10 w-full max-w-full rounded border border-[var(--lv-border)] bg-[var(--lv-bg)] px-2 text-sm text-[var(--lv-text)] disabled:opacity-50"
            value={rangeSelected ? assessment.rangeKey : ""}
            disabled={!canSelectRange}
            aria-describedby={`${ids.rangeReason} ${ids.status}`}
            onChange={(event) => onRangeChange(event.target.value === assessment.rangeKey)}
          >
            <option value="">{"範囲を確認してください"}</option>
            {assessment.snapshot ? (
              <option value={assessment.rangeKey}>
                {`${assessment.bars}小節`}
              </option>
            ) : null}
          </select>
        </label>
      </div>
      <p id={ids.voiceReason} className="mt-2 break-words text-xs text-[var(--lv-text-muted)]">
        {voices.length
          ? ("自動候補でも保存するVoiceは選択が必要です。")
          : ("保存可能なBass Voiceがありません。")}
      </p>
      <p id={ids.rangeReason} className="mt-1 break-words text-xs text-[var(--lv-text-muted)]">
        {reason ?? ("4/4の確定範囲です。")}
      </p>
      <div id={ids.status} className="mt-2 text-xs text-[var(--lv-text-secondary)]" aria-live="polite">
        {assessment.snapshot ? (
          <p className="break-words">
            {`${assessment.noteCount}音・${assessment.bars}小節${assessment.hasSimultaneousNotes ? "・同時発音あり" : ""}${assessment.hasOverlappingNotes ? "・重なりあり" : ""}`}
          </p>
        ) : null}
      </div>
      <label className="mt-3 flex min-w-0 items-start gap-2 text-sm text-[var(--lv-text)]">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0"
          checked={optedIn}
          disabled={!canOptIn && !optedIn}
          aria-describedby={`${ids.description} ${ids.rangeReason} ${ids.status}`}
          onChange={(event) => onOptInChange(event.target.checked)}
        />
        <span className="min-w-0 break-words">
          {"元ベースラインを練習用に保存"}
        </span>
      </label>
      <p className="mt-2 break-words text-xs font-medium text-amber-100">
        {"Vault書き出しに含まれます"}
      </p>
    </section>
  );
}

function reasonCopy(
  reason: SourceBasslineCaptureAssessment["reason"],
): string | undefined {
  if (!reason) return undefined;
  if (reason === "select-voice") return "先にBass Voiceを選択してください。";
  if (reason === "voice-ineligible") return "選択したVoiceは現在の保存候補ではありません。";
  if (reason === "source-unavailable") return "対象ソースを確認できません。";
  if (reason === "source-misaligned") return "複数ソースまたは解析範囲との対応を一意に確認できません。";
  if (reason === "analysis-unavailable") return "この解析結果のsource authorityを確認できません。";
  if (reason === "analysis-mismatch") return "解析結果と元ソースが一致しないため保存できません。";
  if (reason === "range-ineligible") return "同じソースの1〜12小節の確定範囲ではありません。";
  if (reason === "meter-ineligible") return "拍子変更があるため保存できません。";
  if (reason === "timing-unavailable") return "raw tickの音価を確認できないため保存できません。";
  if (reason === "empty") return "この範囲にBass noteがありません。";
  return "snapshotが不正または上限超過のため保存できません。";
}
