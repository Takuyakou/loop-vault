import { useId } from "react";
import type { AnalysisSessionVoice } from "../../domain/midi/preAnalysis/types";
import type { SourceBasslineCaptureAssessment } from "../../domain/sourceBassline";
import type { AppLanguage } from "../../i18n";

export function SourceBasslineCapturePanel({
  voices,
  selectedVoiceId,
  assessment,
  rangeSelected,
  optedIn,
  language,
  onVoiceChange,
  onRangeChange,
  onOptInChange,
}: {
  voices: readonly AnalysisSessionVoice[];
  selectedVoiceId: string;
  assessment: SourceBasslineCaptureAssessment;
  rangeSelected: boolean;
  optedIn: boolean;
  language: AppLanguage;
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
  const reason = reasonCopy(assessment.reason, language);
  const canSelectRange = selectedVoiceId !== "" && assessment.snapshot !== undefined;
  const canOptIn = canSelectRange && rangeSelected;
  return (
    <section
      className="mt-4 min-w-0 border border-[var(--lv-border)] bg-[var(--lv-surface)] p-3"
      aria-labelledby={ids.title}
      data-testid="source-bassline-capture-panel"
    >
      <h3 id={ids.title} className="text-sm font-semibold text-[var(--lv-text)]">
        {language === "ja" ? "元ベースライン候補" : "Source bassline candidate"}
      </h3>
      <p id={ids.description} className="mt-1 break-words text-xs text-[var(--lv-text-muted)]">
        {language === "ja"
          ? "選んだBass Voiceの実ノートを、元MIDIとは切り離して練習用に保存できます。Voice名やファイル情報は保存しません。"
          : "Save the selected Bass Voice notes as a detached practice snapshot. Voice and file identity are not stored."}
      </p>
      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-semibold text-[var(--lv-text-secondary)]">
          {language === "ja" ? "Bass Voiceを選択" : "Select Bass Voice"}
          <select
            className="mt-1 block min-h-10 w-full max-w-full rounded border border-[var(--lv-border)] bg-[var(--lv-bg)] px-2 text-sm text-[var(--lv-text)]"
            value={selectedVoiceId}
            disabled={voices.length === 0}
            aria-describedby={`${ids.description} ${ids.voiceReason}`}
            onChange={(event) => onVoiceChange(event.target.value)}
          >
            <option value="">{language === "ja" ? "選択してください" : "Choose a candidate"}</option>
            {voices.map((voice) => (
              <option key={voice.id} value={voice.id}>{voice.displayName}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0 text-xs font-semibold text-[var(--lv-text-secondary)]">
          {language === "ja" ? "保存する範囲" : "Range to save"}
          <select
            className="mt-1 block min-h-10 w-full max-w-full rounded border border-[var(--lv-border)] bg-[var(--lv-bg)] px-2 text-sm text-[var(--lv-text)] disabled:opacity-50"
            value={rangeSelected ? assessment.rangeKey : ""}
            disabled={!canSelectRange}
            aria-describedby={`${ids.rangeReason} ${ids.status}`}
            onChange={(event) => onRangeChange(event.target.value === assessment.rangeKey)}
          >
            <option value="">{language === "ja" ? "範囲を確認してください" : "Confirm the range"}</option>
            {assessment.snapshot ? (
              <option value={assessment.rangeKey}>
                {language === "ja" ? `${assessment.bars}小節` : `${assessment.bars} bars`}
              </option>
            ) : null}
          </select>
        </label>
      </div>
      <p id={ids.voiceReason} className="mt-2 break-words text-xs text-[var(--lv-text-muted)]">
        {voices.length
          ? (language === "ja" ? "自動候補でも保存するVoiceは選択が必要です。" : "A Voice must be selected even when an automatic candidate exists.")
          : (language === "ja" ? "保存可能なBass Voiceがありません。" : "No eligible Bass Voice is available.")}
      </p>
      <p id={ids.rangeReason} className="mt-1 break-words text-xs text-[var(--lv-text-muted)]">
        {reason ?? (language === "ja" ? "4/4の確定範囲です。" : "This is a proven 4/4 range.")}
      </p>
      <div id={ids.status} className="mt-2 text-xs text-[var(--lv-text-secondary)]" aria-live="polite">
        {assessment.snapshot ? (
          <p className="break-words">
            {language === "ja"
              ? `${assessment.noteCount}音・${assessment.bars}小節${assessment.hasSimultaneousNotes ? "・同時発音あり" : ""}${assessment.hasOverlappingNotes ? "・重なりあり" : ""}`
              : `${assessment.noteCount} notes · ${assessment.bars} bars${assessment.hasSimultaneousNotes ? " · simultaneous notes" : ""}${assessment.hasOverlappingNotes ? " · overlaps" : ""}`}
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
          {language === "ja" ? "元ベースラインを練習用に保存" : "Save source bassline for practice"}
        </span>
      </label>
      <p className="mt-2 break-words text-xs font-medium text-amber-100">
        {language === "ja" ? "Vault書き出しに含まれます" : "Included in Vault export"}
      </p>
    </section>
  );
}

function reasonCopy(
  reason: SourceBasslineCaptureAssessment["reason"],
  language: AppLanguage,
): string | undefined {
  if (!reason) return undefined;
  if (reason === "select-voice") return language === "ja"
    ? "先にBass Voiceを選択してください。"
    : "Select a Bass Voice first.";
  const ja = language === "ja";
  if (reason === "voice-ineligible") return ja ? "選択したVoiceは現在の保存候補ではありません。" : "The selected Voice is no longer eligible.";
  if (reason === "source-unavailable") return ja ? "対象ソースを確認できません。" : "The source cannot be verified.";
  if (reason === "source-misaligned") return ja ? "複数ソースまたは解析範囲との対応を一意に確認できません。" : "The source cannot be matched uniquely to this analysis range.";
  if (reason === "analysis-unavailable") return ja ? "この解析結果のsource authorityを確認できません。" : "Source authority is unavailable for this analysis result.";
  if (reason === "analysis-mismatch") return ja ? "解析結果と元ソースが一致しないため保存できません。" : "The analysis result does not match the source authority.";
  if (reason === "range-ineligible") return ja ? "同じソースの1〜12小節の確定範囲ではありません。" : "The range is not a proven 1–12 bar range from the same source.";
  if (reason === "meter-ineligible") return ja ? "拍子変更があるため保存できません。" : "A meter change makes this range unavailable.";
  if (reason === "timing-unavailable") return ja ? "raw tickの音価を確認できないため保存できません。" : "Raw-tick timing authority is unavailable.";
  if (reason === "empty") return ja ? "この範囲にBass noteがありません。" : "There are no Bass notes in this range.";
  return ja ? "snapshotが不正または上限超過のため保存できません。" : "The snapshot is invalid or over budget.";
}
