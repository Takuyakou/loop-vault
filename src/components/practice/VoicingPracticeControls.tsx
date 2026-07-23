import {
  AlertTriangle,
  Play,
  Square,
} from "lucide-react";
import type { AppLanguage } from "../../domain/types";
import type {
  GeneratedStyleVoicingPlan,
  PracticeTargetSource,
  StyleVoicingMatchMode,
  VoicingPracticePreferences,
} from "../../domain/voicingPractice";

interface VoicingPracticeControlsProps {
  language: AppLanguage;
  targetSource: PracticeTargetSource;
  preferences: VoicingPracticePreferences;
  matchMode: StyleVoicingMatchMode;
  allowUnsupportedFallback: boolean;
  plan?: GeneratedStyleVoicingPlan;
  eventBars: Readonly<Record<string, number>>;
  running: boolean;
  previewing: boolean;
  previewDisabled: boolean;
  onTargetSourceChange(source: PracticeTargetSource): void;
  onPreferencesChange(preferences: VoicingPracticePreferences): void;
  onMatchModeChange(mode: StyleVoicingMatchMode): void;
  onAllowUnsupportedFallbackChange(value: boolean): void;
  onPreview(): void;
}

const copy = {
  ja: {
    title: "練習するボイシング",
    resolved: "保存ボイシング（既定）",
    close: "自動（クローズ）",
    shell: "シェル 1-7",
    open: "オープン 1-7",
    rootless: "ルートレス A/B",
    resolvedDescription: "保存済みの押さえ方を優先し、元MIDIまたは自動生成へ安全にフォールバックします。",
    closeDescription: "既存の自動Voicingを進行全体で練習します。",
    shellDescription: "左手の目安はRoot + 7th、右手は3rd + Tension。少ない音で和声機能を捉えます。",
    openDescription: "Root / 7thと上声を広く配置し、開いた音場と左右の分担を練習します。",
    rootlessDescription: "Rootを省き、3rd・7th・9th・13thを中心に、進行全体からA/Bを選びます。",
    stylePractice: "スタイル練習",
    unranked: "段位対象外",
    leftSpan: "左手の最大スパン",
    rightSpan: "右手の最大スパン",
    octave: "オクターブ",
    ninth: "9度",
    tenth: "10度",
    judgement: "判定",
    exact: "指定音高",
    pitchClass: "ゆるく（ピッチクラス）",
    octaveShift: "全体のオクターブ移動を許可",
    preview: "進行を試聴",
    stop: "停止",
    unsupported: (count: number) => `この進行には選択中のStyleへ未対応のコードが${count}件あります。`,
    fallback: "未対応コードだけ自動（クローズ）を使用",
    fallbackHint: "OFFではセッションを開始できません。",
    bar: (bar: number) => `${bar}小節目`,
  },
  en: {
    title: "Practice voicing",
    resolved: "Saved voicing (default)",
    close: "Automatic (close)",
    shell: "Shell 1-7",
    open: "Open 1-7",
    rootless: "Rootless A/B",
    resolvedDescription: "Prioritizes saved shapes, then safely falls back to source MIDI or generated voicing.",
    closeDescription: "Practice the existing automatic voicing across the progression.",
    shellDescription: "LH guide: Root + 7th. RH guide: 3rd + Tension. Learn function with fewer notes.",
    openDescription: "Spreads Root / 7th and upper voices to practice an open register and hand roles.",
    rootlessDescription: "Omits Root and centers 3rd, 7th, 9th, and 13th. A/B is selected across the progression.",
    stylePractice: "Style practice",
    unranked: "Excluded from level progress",
    leftSpan: "Maximum left-hand span",
    rightSpan: "Maximum right-hand span",
    octave: "Octave",
    ninth: "Ninth",
    tenth: "Tenth",
    judgement: "Judgement",
    exact: "Specified pitches",
    pitchClass: "Loose (pitch classes)",
    octaveShift: "Allow one global octave shift",
    preview: "Preview progression",
    stop: "Stop",
    unsupported: (count: number) => `${count} chord(s) in this progression are unsupported by the selected style.`,
    fallback: "Use Automatic (close) only for unsupported chords",
    fallbackHint: "The session cannot start while this is off.",
    bar: (bar: number) => `Bar ${bar}`,
  },
} as const;

export function VoicingPracticeControls({
  language,
  targetSource,
  preferences,
  matchMode,
  allowUnsupportedFallback,
  plan,
  eventBars,
  running,
  previewing,
  previewDisabled,
  onTargetSourceChange,
  onPreferencesChange,
  onMatchModeChange,
  onAllowUnsupportedFallbackChange,
  onPreview,
}: VoicingPracticeControlsProps) {
  const text = copy[language];
  const sourceValue = practiceTargetSourceValue(targetSource);
  const styleMode = targetSource.type !== "resolved-voicing";
  const unsupported = plan?.unsupportedEvents ?? [];
  return (
    <section
      className="border-b border-[var(--lv-border)] py-4"
      data-testid="voicing-practice-controls"
      data-style-practice={styleMode ? "true" : "false"}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(15rem,1fr)_auto]">
        <div className="min-w-0">
          <label className="text-xs font-semibold text-[var(--lv-text-muted)]" htmlFor="practice-target-source">
            {text.title}
          </label>
          <select
            id="practice-target-source"
            data-testid="practice-target-source"
            className="lv-input mt-2 block w-full max-w-sm text-sm"
            value={sourceValue}
            onChange={(event) => onTargetSourceChange(parsePracticeTargetSource(event.target.value))}
          >
            <option value="resolved-voicing">{text.resolved}</option>
            <option value="generated-close">{text.close}</option>
            <option value="shell-17">{text.shell}</option>
            <option value="open-17">{text.open}</option>
            <option value="rootless-ab">{text.rootless}</option>
          </select>
          <p className="mt-2 max-w-3xl text-sm text-[var(--lv-text-muted)]">
            {sourceDescription(sourceValue, text)}
          </p>
          {styleMode ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="border border-teal-700 px-2 py-1 text-xs font-semibold text-teal-200">
                {text.stylePractice}
              </span>
              <span className="border border-[var(--lv-border)] px-2 py-1 text-xs text-[var(--lv-text-muted)]">
                {text.unranked}
              </span>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="lv-button-ghost inline-flex h-10 items-center gap-2 px-3 text-sm"
          disabled={previewDisabled}
          onClick={onPreview}
        >
          {previewing
            ? <Square aria-hidden="true" size={16} />
            : <Play aria-hidden="true" size={16} />}
          {previewing ? text.stop : text.preview}
        </button>
      </div>

      {styleMode ? (
        <div className="mt-4 grid gap-4 border-t border-[var(--lv-border)] pt-4 lg:grid-cols-[auto_auto_minmax(16rem,1fr)]">
          <SpanSelect
            label={text.leftSpan}
            value={preferences.maxLeftHandSpanSemitones}
            disabled={running}
            text={text}
            onChange={(value) => onPreferencesChange({
              ...preferences,
              maxLeftHandSpanSemitones: value,
            })}
          />
          <SpanSelect
            label={text.rightSpan}
            value={preferences.maxRightHandSpanSemitones}
            disabled={running}
            text={text}
            onChange={(value) => onPreferencesChange({
              ...preferences,
              maxRightHandSpanSemitones: value,
            })}
          />
          <div>
            <p className="text-xs font-semibold text-[var(--lv-text-muted)]">{text.judgement}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <button
                type="button"
                className={segmentClass(matchMode === "exact-pitch")}
                disabled={running}
                onClick={() => onMatchModeChange("exact-pitch")}
              >
                {text.exact}
              </button>
              <button
                type="button"
                className={segmentClass(matchMode === "pitch-class")}
                disabled={running}
                onClick={() => onMatchModeChange("pitch-class")}
              >
                {text.pitchClass}
              </button>
            </div>
            {matchMode === "exact-pitch" ? (
              <label className="mt-3 inline-flex items-center gap-2 text-sm text-[var(--lv-text-muted)]">
                <input
                  type="checkbox"
                  checked={preferences.allowGlobalOctaveShift}
                  disabled={running}
                  onChange={(event) => onPreferencesChange({
                    ...preferences,
                    allowGlobalOctaveShift: event.target.checked,
                  })}
                />
                {text.octaveShift}
              </label>
            ) : null}
          </div>
        </div>
      ) : null}

      {styleMode && unsupported.length > 0 ? (
        <div className="mt-4 border border-amber-700 bg-amber-950/20 p-3 text-sm text-amber-100">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle aria-hidden="true" size={16} />
            {text.unsupported(unsupported.length)}
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {unsupported.map((event) => (
              <li key={event.eventId}>
                {text.bar(eventBars[event.eventId] ?? 1)}: {event.chordLabel} ·{" "}
                {localizedUnsupportedReason(event.reason, language)}
              </li>
            ))}
          </ul>
          <label className="mt-3 inline-flex items-center gap-2">
            <input
              data-testid="practice-unsupported-fallback"
              type="checkbox"
              checked={allowUnsupportedFallback}
              disabled={running}
              onChange={(event) => onAllowUnsupportedFallbackChange(event.target.checked)}
            />
            {text.fallback}
          </label>
          {!allowUnsupportedFallback ? (
            <p className="mt-1 text-xs text-amber-200">{text.fallbackHint}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SpanSelect({
  label,
  value,
  disabled,
  text,
  onChange,
}: {
  label: string;
  value: 12 | 14 | 16;
  disabled: boolean;
  text: typeof copy.ja | typeof copy.en;
  onChange(value: 12 | 14 | 16): void;
}) {
  return (
    <label className="text-xs font-semibold text-[var(--lv-text-muted)]">
      {label}
      <select
        className="lv-input mt-2 block min-w-32 text-sm"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value) as 12 | 14 | 16)}
      >
        <option value={12}>{text.octave}</option>
        <option value={14}>{text.ninth}</option>
        <option value={16}>{text.tenth}</option>
      </select>
    </label>
  );
}

function sourceDescription(
  value: string,
  text: typeof copy.ja | typeof copy.en,
): string {
  if (value === "generated-close") return text.closeDescription;
  if (value === "shell-17") return text.shellDescription;
  if (value === "open-17") return text.openDescription;
  if (value === "rootless-ab") return text.rootlessDescription;
  return text.resolvedDescription;
}

function practiceTargetSourceValue(source: PracticeTargetSource): string {
  return source.type === "style" ? source.styleId : source.type;
}

function parsePracticeTargetSource(value: string): PracticeTargetSource {
  if (value === "generated-close") return { type: "generated-close" };
  if (value === "shell-17" || value === "open-17" || value === "rootless-ab") {
    return {
      type: "style",
      styleId: value,
      ...(value === "rootless-ab" ? { rootlessVariantPolicy: "auto" as const } : {}),
    };
  }
  return { type: "resolved-voicing" };
}

function segmentClass(active: boolean): string {
  return active
    ? "border border-[var(--lv-accent)] bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950"
    : "lv-button-ghost px-3 py-2 text-sm";
}

function localizedUnsupportedReason(
  reason: string,
  language: AppLanguage,
): string {
  if (language === "ja") return reason;
  if (reason === "コード構成音を解釈できません。") {
    return "The chord tones could not be interpreted.";
  }
  if (reason === "スラッシュコードはルートレスA/BのMVP対象外です。") {
    return "Slash chords are not supported by Rootless A/B in this version.";
  }
  if (reason === "このコード種はルートレスA/BのMVP対象外です。") {
    return "This chord quality is not supported by Rootless A/B in this version.";
  }
  if (reason === "現在のspanでは候補を生成できません。") {
    return "No playable candidate fits the current hand spans.";
  }
  return "No playable candidate is available for this chord.";
}
