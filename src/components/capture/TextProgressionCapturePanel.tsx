import { useEffect, useMemo, useState } from "react";
import { voiceChordForPreview } from "../../domain/chordVoicing";
import { romanNumeralHint } from "../../domain/harmony/romanNumerals";
import {
  confirmedTextProgressionKeyState,
  evaluateTextProgressionCapabilities,
  parseTextProgression,
  type TextProgressionCapability,
  type TextProgressionDiagnostic,
  type TextProgressionEvent,
  type TextProgressionToken,
} from "../../domain/textProgression";
import {
  createTextProgressionDraft,
  textProgressionDraftTitle,
  textProgressionEventKey,
  type TextProgressionVoicingOverrides,
} from "../../domain/textProgressionDraft";
import type { ChordVoicingMemory } from "../../domain/types";
import type { ManualCandidateDraft } from "../../domain/midi/manualDraft";
import type { AppLanguage } from "../../i18n";
import { VoicingPanel } from "../voicing/VoicingPanel";

export interface TextProgressionConvertedDraft {
  readonly draft: ManualCandidateDraft;
  readonly title: string;
  readonly bpm?: number;
  readonly confirmedKey?: string;
}

interface TextProgressionCapturePanelProps {
  readonly language: AppLanguage;
  readonly showRomanNumerals: boolean;
  /** Once converted, the existing ManualCandidateDraft is authoritative. */
  readonly draftActive?: boolean;
  readonly onConvert: (converted: TextProgressionConvertedDraft) => void;
  readonly onPreview: (
    event: TextProgressionEvent,
    memory: ChordVoicingMemory | undefined,
    bpm: number,
  ) => void;
  readonly onStop: () => void;
}

/**
 * A bounded, text-only Capture intake. Parsing is transient until the person
 * explicitly converts a fully valid result into the existing session Draft.
 */
export function TextProgressionCapturePanel({
  language,
  showRomanNumerals,
  draftActive = false,
  onConvert,
  onPreview,
  onStop,
}: TextProgressionCapturePanelProps) {
  const [input, setInput] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [confirmedKey, setConfirmedKey] = useState<string>();
  const [keyError, setKeyError] = useState<string>();
  const [bpmInput, setBpmInput] = useState("");
  const [selectedEventKey, setSelectedEventKey] = useState<string>();
  const [voicingOverrides, setVoicingOverrides] = useState<TextProgressionVoicingOverrides>(new Map());

  const result = useMemo(() => parseTextProgression(input, {
    keyState: confirmedTextProgressionKeyState(confirmedKey),
  }), [confirmedKey, input]);
  const explicitBpm = parseExplicitBpm(bpmInput);
  const capabilities = useMemo(
    () => evaluateTextProgressionCapabilities({ result, ...(explicitBpm === undefined ? {} : { bpm: explicitBpm }) }),
    [explicitBpm, result],
  );
  const selectedEvent = useMemo(() => result.events.find(
    (event) => textProgressionEventKey(event) === selectedEventKey,
  ) ?? result.events[0], [result.events, selectedEventKey]);
  const selectedKey = selectedEvent ? textProgressionEventKey(selectedEvent) : undefined;
  const selectedMemory = selectedKey === undefined ? undefined : voicingOverrides.get(selectedKey);

  useEffect(() => () => onStop(), [onStop]);

  useEffect(() => {
    if (!selectedEvent) {
      setSelectedEventKey(undefined);
      return;
    }
    if (selectedEventKey !== textProgressionEventKey(selectedEvent)) {
      setSelectedEventKey(textProgressionEventKey(selectedEvent));
    }
  }, [selectedEvent, selectedEventKey]);

  function selectEvent(event: TextProgressionEvent) {
    if (draftActive) return;
    onStop();
    setSelectedEventKey(textProgressionEventKey(event));
  }

  function confirmKey() {
    onStop();
    const state = confirmedTextProgressionKeyState(keyInput);
    if (state.kind !== "confirmed") {
      setKeyError(text(language, "Enter a supported key, for example C major.", "C major のような対応キーを入力してください。"));
      return;
    }
    setKeyError(undefined);
    setKeyInput(state.key);
    setConfirmedKey(state.key);
  }

  function clearKey() {
    if (draftActive) return;
    onStop();
    setKeyError(undefined);
    setKeyInput("");
    setConfirmedKey(undefined);
  }

  function chooseSuggestedKey(key: string) {
    if (draftActive) return;
    onStop();
    if (draftActive) return;
    setKeyError(undefined);
    setKeyInput(key);
  }

  function updateVoicing(memory: ChordVoicingMemory | undefined) {
    if (draftActive || selectedKey === undefined) return;
    const practice = memory?.practiceVoicingOverride;
    setVoicingOverrides((current) => {
      const next = new Map(current);
      if (!practice) {
        next.delete(selectedKey);
      } else {
        next.set(selectedKey, {
          practiceVoicingOverride: {
            ...practice,
            midiNotes: [...practice.midiNotes],
          },
        });
      }
      return next;
    });
  }

  function convert() {
    if (draftActive || !result.canConvert) return;
    try {
      const draft = createTextProgressionDraft({ result, voicingOverrides });
      const key = result.keyState.kind === "confirmed" ? result.keyState.key : undefined;
      onConvert({
        draft,
        title: textProgressionDraftTitle(result),
        ...(explicitBpm === undefined ? {} : { bpm: explicitBpm }),
        ...(key === undefined ? {} : { confirmedKey: key }),
      });
    } catch {
      // canConvert is the stable contract. Keep the editor on this text if a
      // future invariant rejects it instead of manufacturing a partial Draft.
    }
  }

  function previewSelected() {
    if (draftActive || !selectedEvent || explicitBpm === undefined) return;
    onPreview(selectedEvent, selectedMemory, explicitBpm);
  }

  const confirmed = result.keyState.kind === "confirmed";
  const suggestions = result.keyState.kind === "inferred" ? result.keyState.candidates : [];
  const disabled = draftActive;

  return (
    <section className="border border-[var(--lv-border)] bg-[var(--lv-bg)]/70 p-5" data-testid="text-progression-capture">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">
            {text(language, "Text progression", "テキスト進行")}
          </p>
          <h2 className="mt-2 text-2xl font-semibold">{text(language, "Enter chord progression", "コード進行を入力")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--lv-text-muted)]">
            {text(language, "Use one chord per line, or exact 4/4 bars such as | Dm7 G7 | Cmaj7 |.", "1行に1コード、または | Dm7 G7 | Cmaj7 | のような正確な4/4小節で入力します。")}
          </p>
        </div>
        {draftActive ? (
          <p className="border border-[var(--lv-border)] px-3 py-2 text-xs text-[var(--lv-text-muted)]" data-testid="text-draft-authoritative">
            {text(language, "The converted Draft is now authoritative. Save or discard it before changing this text.", "変換後のDraftが現在の正本です。テキストを変更する前に保存または破棄してください。")}
          </p>
        ) : null}
      </div>

      <label className="mt-5 block text-sm font-semibold text-[var(--lv-text)]" htmlFor="text-progression-input">
        {text(language, "Chord progression", "コード進行")}
      </label>
      <textarea
        id="text-progression-input"
        data-testid="text-progression-input"
        className="mt-2 min-h-32 w-full border border-[var(--lv-border)] bg-[var(--lv-surface)] p-3 font-mono text-sm text-[var(--lv-text)]"
        value={input}
        disabled={disabled}
        aria-invalid={result.diagnostics.length > 0}
        aria-describedby={result.diagnostics.length > 0
          ? "text-progression-format text-progression-diagnostics"
          : "text-progression-format"}
        {...(result.diagnostics.length > 0 ? { "aria-errormessage": "text-progression-diagnostics" } : {})}
        onChange={(event) => { onStop(); setInput(event.target.value); }}
      />
      <p id="text-progression-format" className="mt-2 text-xs text-[var(--lv-text-muted)]">
        {text(language, "Strict v1: 4/4 only; each bar has 1, 2, or 4 chord tokens; maximum 12 bars / 48 tokens.", "v1は4/4のみ。各小節は1・2・4コード、最大12小節・48コードです。")}
      </p>

      <TextProgressionCards
        events={result.events}
        tokens={result.tokens}
        voicingOverrides={voicingOverrides}
        selectedKey={selectedKey}
        confirmedKey={confirmed ? result.keyState.key : undefined}
        showRomanNumerals={showRomanNumerals}
        language={language}
        disabled={disabled}
        onSelect={selectEvent}
      />

      <section className="mt-5 grid gap-4 border-t border-[var(--lv-border)] pt-5 lg:grid-cols-2" aria-label={text(language, "Key and tempo", "キーとテンポ")}>
        <div>
          <label className="block text-sm font-semibold" htmlFor="text-progression-key">
            {text(language, "Confirmed key", "確定キー")}
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id="text-progression-key"
              data-testid="text-progression-key"
              className="min-h-10 flex-1 border border-[var(--lv-border)] bg-[var(--lv-surface)] px-3 text-sm"
              value={keyInput}
              disabled={disabled}
              onChange={(event) => { onStop(); setKeyInput(event.target.value); }}
              placeholder="C major"
            />
            <button type="button" className="lv-button-secondary px-3 py-2 text-sm" disabled={disabled} onClick={confirmKey}>
              {text(language, "Confirm key", "キーを確定")}
            </button>
            <button type="button" className="lv-button-ghost px-3 py-2 text-sm" disabled={disabled || !confirmedKey} onClick={clearKey}>
              {text(language, "Clear key", "キーをクリア")}
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--lv-text-muted)]" data-testid="text-progression-key-state">
            {confirmed
              ? text(language, `Confirmed: ${result.keyState.key}`, `確定: ${result.keyState.key}`)
              : text(language, "Only an explicitly confirmed key enables Roman/numeric input and degree display.", "明示的に確定したキーだけがローマ数字・数字入力と度数表示に使われます。")}
          </p>
          {keyError ? <p role="alert" className="mt-2 text-xs text-amber-200">{keyError}</p> : null}
          {suggestions.length ? (
            <div className="mt-3" data-testid="text-progression-key-suggestions">
              <p className="text-xs text-[var(--lv-text-muted)]">
                {text(language, "Suggestions only — choose one, then confirm it yourself.", "候補です。選択後にご自身で確定してください。")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestions.map((candidate) => (
                  <button
                    key={candidate.key}
                    type="button"
                    className="border border-[var(--lv-border)] px-2 py-1 text-xs text-[var(--lv-text)]"
                    disabled={disabled}
                    onClick={() => chooseSuggestedKey(candidate.key)}
                  >
                    {candidate.key}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-semibold" htmlFor="text-progression-bpm">
            {text(language, "Tempo (optional BPM)", "テンポ（任意BPM）")}
          </label>
          <input
            id="text-progression-bpm"
            data-testid="text-progression-bpm"
            className="mt-2 min-h-10 w-full border border-[var(--lv-border)] bg-[var(--lv-surface)] px-3 text-sm"
            inputMode="numeric"
            value={bpmInput}
            disabled={disabled}
            onChange={(event) => { onStop(); setBpmInput(event.target.value); }}
            placeholder="30–240"
          />
          <p className="mt-2 text-xs text-[var(--lv-text-muted)]">
            {bpmInput && explicitBpm === undefined
              ? text(language, "Playback requires an explicit BPM from 30 to 240. Saving can still omit BPM.", "再生には30〜240の明示BPMが必要です。保存時はBPMなしでも構いません。")
              : text(language, "Text has no source preview. Audition uses the generated chord voicing with an explicit BPM.", "テキストには元音源プレビューはありません。明示BPMで生成コードボイシングを試聴します。")}
          </p>
        </div>
      </section>

      <TextDiagnostics diagnostics={result.diagnostics} language={language} />

      {selectedEvent && !draftActive ? (
        <section className="mt-5 border border-[var(--lv-border)] bg-[var(--lv-surface)]/60 p-4" data-testid="text-progression-inspector">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">
                {text(language, "Selected chord", "選択中のコード")}
              </p>
              <h3 className="mt-1 text-xl font-semibold">{selectedEvent.canonical}</h3>
              <p className="mt-1 text-sm text-[var(--lv-text-muted)]">
                {timingLabel(selectedEvent, language)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="lv-button-primary px-3 py-2 text-sm"
                data-testid="text-progression-preview"
                disabled={disabled || explicitBpm === undefined}
                onClick={previewSelected}
              >
                {text(language, "Play Auto / Generated", "自動生成を再生")}
              </button>
              <button
                type="button"
                className="lv-button-ghost px-3 py-2 text-sm"
                disabled={disabled}
                onClick={onStop}
              >
                {text(language, "Stop", "停止")}
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--lv-text-muted)]" data-testid="text-progression-auto-generated">
            {text(language, "Auto / Generated — this is not source MIDI and does not claim progression-wide voice leading.", "自動生成です。元MIDIや進行全体のボイスリーディングを示すものではありません。")}
          </p>
          <TextCapabilityList capabilities={capabilities} language={language} />
          <VoicingPanel
            chord={selectedEvent.chord}
            memory={selectedMemory}
            generatedNotes={voiceChordForPreview(selectedEvent.chord).notes}
            language={language}
            sourceAvailable={false}
            sourceApplicable={false}
            onMemoryChange={updateVoicing}
            onReextract={() => undefined}
          />
        </section>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--lv-border)] pt-5">
        <button
          type="button"
          className="lv-button-primary px-4 py-2 text-sm"
          data-testid="text-progression-convert"
          disabled={disabled || !result.canConvert}
          onClick={convert}
        >
          {text(language, "Convert to Draft", "Draftへ変換")}
        </button>
        <p className="text-xs text-[var(--lv-text-muted)]">
          {result.canConvert
            ? text(language, "Conversion is one-way: the existing Draft editor becomes authoritative.", "変換は一方向です。既存Draftエディターが正本になります。")
            : text(language, "Fix every diagnostic before conversion. No partial progression is created.", "変換前にすべての診断を修正してください。部分進行は作成しません。")}
        </p>
      </div>
    </section>
  );
}

function TextProgressionCards({
  events,
  tokens,
  voicingOverrides,
  selectedKey,
  confirmedKey,
  showRomanNumerals,
  language,
  disabled,
  onSelect,
}: {
  readonly events: readonly TextProgressionEvent[];
  readonly tokens: readonly TextProgressionToken[];
  readonly voicingOverrides: TextProgressionVoicingOverrides;
  readonly selectedKey?: string;
  readonly confirmedKey?: string;
  readonly showRomanNumerals: boolean;
  readonly language: AppLanguage;
  readonly disabled: boolean;
  readonly onSelect: (event: TextProgressionEvent) => void;
}) {
  if (!tokens.length) return null;
  const eventsByToken = new Map(events.map((event) => [
    `${event.bar}:${event.range.start}:${event.range.end}`,
    event,
  ]));
  const bars = new Map<number, TextProgressionToken[]>();
  for (const token of tokens) {
    const entries = bars.get(token.bar) ?? [];
    entries.push(token);
    bars.set(token.bar, entries);
  }
  return (
    <section className="mt-4" aria-label={text(language, "Parsed chords", "\u89e3\u6790\u6e08\u307f\u30b3\u30fc\u30c9")}>
      <div className="space-y-3">
        {[...bars.entries()].map(([bar, barTokens]) => (
          <section
            key={bar}
            role="group"
            aria-label={barLabel(bar, language)}
            data-testid="text-progression-bar"
            className="border-l-2 border-[var(--lv-border)] pl-3"
          >
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--lv-text-muted)]">
              {barLabel(bar, language)}
            </h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {barTokens.map((token) => {
                const event = eventsByToken.get(`${token.bar}:${token.range.start}:${token.range.end}`);
                if (!event) {
                  return (
                    <div
                      key={`${token.index}:${token.range.start}`}
                      className="min-w-0 break-words border border-amber-400/50 bg-amber-950/20 p-3 text-left [overflow-wrap:anywhere]"
                      data-testid="text-progression-invalid-card"
                    >
                      <span className="block font-semibold text-amber-50">{token.raw}</span>
                      <span className="mt-1 block text-xs text-amber-100">
                        {text(language, "Needs correction", "\u4fee\u6b63\u304c\u5fc5\u8981")}
                      </span>
                      <span className="mt-1 block text-xs text-[var(--lv-text-muted)]">
                        {tokenLocation(token, language)}
                      </span>
                    </div>
                  );
                }
                const key = textProgressionEventKey(event);
                const hasCustomPracticeVoicing = Boolean(
                  voicingOverrides.get(key)?.practiceVoicingOverride,
                );                const degree = confirmedKey && showRomanNumerals
                  ? romanNumeralHint(event.chord, confirmedKey)?.label
                  : undefined;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`border p-3 text-left ${key === selectedKey ? "border-[var(--lv-accent)] bg-teal-950/40" : "border-[var(--lv-border)]"}`}
                    data-testid="text-progression-card"
                    data-selected={key === selectedKey ? "true" : "false"}
                    aria-pressed={key === selectedKey}
                    disabled={disabled}
                    onClick={() => onSelect(event)}
                  >
                    <span className="block font-semibold text-[var(--lv-text)]">{event.canonical}</span>
                    <span className="mt-1 block text-xs text-[var(--lv-text-muted)]">{timingLabel(event, language)}</span>
                    {degree ? <span className="mt-1 block text-xs text-teal-200">{degree}</span> : null}
                    <span className="mt-1 block text-xs text-[var(--lv-text-muted)]" data-testid="text-progression-voicing-state">
                      {hasCustomPracticeVoicing
                        ? text(language, "Custom / Live MIDI", "\u30ab\u30b9\u30bf\u30e0 / Live MIDI")
                        : text(language, "Auto / Generated", "\u81ea\u52d5 / \u751f\u6210")}
                    </span>                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
function TextDiagnostics({
  diagnostics,
  language,
}: {
  readonly diagnostics: readonly TextProgressionDiagnostic[];
  readonly language: AppLanguage;
}) {
  if (!diagnostics.length) return null;
  return (
    <section id="text-progression-diagnostics" className="mt-5 border border-amber-400/50 bg-amber-950/20 p-4" role="status" aria-live="polite" data-testid="text-progression-diagnostics">
      <h3 className="text-sm font-semibold text-amber-100">{text(language, "Fix before converting", "変換前に修正")}</h3>
      <ul className="mt-2 space-y-1 text-sm text-amber-50">
        {diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}:${diagnostic.range.start}:${index}`} className="min-w-0 break-words [overflow-wrap:anywhere]">
            <span className="font-medium">{diagnosticLocation(diagnostic, language)}: </span>
            {diagnosticMessage(diagnostic, language)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TextCapabilityList({
  capabilities,
  language,
}: {
  readonly capabilities: readonly TextProgressionCapability[];
  readonly language: AppLanguage;
}) {
  return (
    <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2" data-testid="text-progression-capabilities">
      {capabilities.map((capability) => (
        <div key={capability.name} className="border border-[var(--lv-border)] px-3 py-2">
          <dt className="font-semibold text-[var(--lv-text)]">{capabilityName(capability.name, language)}</dt>
          <dd className="mt-1 text-[var(--lv-text-muted)]" data-capability-status={capability.status}>
            {capabilityStatus(capability.status, language)}: {capabilityReason(capability, language)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function diagnosticMessage(diagnostic: TextProgressionDiagnostic, language: AppLanguage): string {
  if (language !== "ja") return diagnostic.message;
  const messages: Record<TextProgressionDiagnostic["code"], string> = {
    "empty-input": "少なくとも1つのコード・トークンを入力してください。",
    "input-too-long": "テキスト進行入力は最大4,096 UTF-16コード単位です。",
    "unsupported-meter": "テキスト進行入力 v1 は4/4のみに対応しています。",
    "malformed-bar-notation": "小節表記は `|` で始まり `|` で終える必要があります。",
    "empty-bar": "空の小節はテキスト進行入力では使用できません。",
    "too-many-bars": "テキスト進行入力は最大12小節です。",
    "too-many-tokens": "テキスト進行入力は最大48個のコード・トークンです。",
    "three-chord-bar": "1小節に3つのコードは、v1の文法では正確に表現できません。",
    "invalid-chord-count": "4/4の各小節には、コード・トークンを1つ、2つ、または4つだけ入力できます。",
    "invalid-chord": "このトークンは対応するコード表記ではありません。",
    "degree-requires-confirmed-key": "ローマ数字または数字のコード表記には、ユーザーが確認したキーが必要です。",
    "no-chord-not-supported": "N.C. とコードなしの休符は、テキスト進行入力 v1 では使用できません。",
    "unsupported-repeat": "繰り返し記法は、テキスト進行入力 v1 では使用できません。",
    "unsupported-comment": "コメントは、テキスト進行入力 v1 では使用できません。",
    "unsupported-section-header": "セクション見出しは、テキスト進行入力 v1 では使用できません。",
    "lyric-mixed-text": "歌詞や自由テキストは、テキスト進行入力 v1 では使用できません。",
  };
  return messages[diagnostic.code];
}

function capabilityStatus(
  status: TextProgressionCapability["status"],
  language: AppLanguage,
): string {
  const japanese: Record<TextProgressionCapability["status"], string> = {
    supported: "利用可能",
    unsupported: "利用不可",
    unknown: "未判定",
  };
  return text(language, status, japanese[status]);
}

function capabilityReason(capability: TextProgressionCapability, language: AppLanguage): string {
  if (language !== "ja") return capability.reason;
  const direct = japaneseCapabilityReason(capability.reason);
  if (direct !== undefined) return direct;

  const bassPractice = /^Bass Practice is (supported|unsupported|unknown): (.+)$/.exec(capability.reason);
  if (bassPractice) {
    const upstream = japaneseChordContextReason(bassPractice[2]!)
      ?? "コードコンテキストの利用条件を確認してください。";
    return `コードコンテキストの条件により、Bass Practiceは${capabilityStatus(capability.status, language)}です。${upstream}`;
  }

  const rootMotion = /^Root Motion depends on an eligible Chord Context snapshot: (.+)$/.exec(capability.reason);
  if (rootMotion) {
    const upstream = japaneseChordContextReason(rootMotion[1]!)
      ?? "コードコンテキストの利用条件を確認してください。";
    return `Root Motionには利用可能なChord Contextスナップショットが必要です。${upstream}`;
  }

  const rootCount = /^No selectable safe Chord Context section has (\d+) chord roots for the selected Root Motion chain\.$/.exec(capability.reason);
  if (rootCount) {
    return `選択したRoot Motionチェーンには、${rootCount[1]}個のコード・ルートを含む選択可能で安全なChord Contextセクションがありません。`;
  }

  return `${capabilityName(capability.name, language)}の利用可否は現在「${capabilityStatus(capability.status, language)}」です。`;
}

function japaneseCapabilityReason(reason: string): string | undefined {
  const chordContext = japaneseChordContextReason(reason);
  if (chordContext !== undefined) return chordContext;
  const messages: Record<string, string> = {
    "A valid text result can enter the existing session-only Draft and normal Vault save path.": "有効なテキスト結果は、既存のセッション専用Draftと通常のVault保存経路に進めます。",
    "Resolve every parser diagnostic before creating a Draft.": "Draftを作成する前に、すべてのパーサー診断を修正してください。",
    "A normally saved valid block remains eligible for Chord Dojo through the existing Vault path.": "通常どおり保存された有効なブロックは、既存のVault経路を通じてChord Dojoの対象になります。",
    "Chord Dojo receives only a normally saved valid block.": "Chord Dojoには、通常どおり保存された有効なブロックだけが渡されます。",
    "The progression meets the existing Chord Context source requirements for Bass Practice.": "この進行は、Bass Practice用の既存Chord Contextソース要件を満たしています。",
    "Auto voicing remains available; compatible Live MIDI practice overrides use the existing Voicing Memory contract.": "自動ボイシングは引き続き利用できます。互換性のあるLive MIDI練習オーバーライドには、既存のVoicing Memory契約を使用します。",
    "Voicing Memory is available after a valid text result reaches the existing Draft path.": "有効なテキスト結果が既存Draft経路に進んだ後、Voicing Memoryを利用できます。",
    "Select a Root Motion note count from 2 through 8 before source eligibility can be evaluated.": "元データの利用可否を評価する前に、Root Motionの音数を2〜8から選択してください。",
    "Root Motion note count must be an integer from 2 through 8.": "Root Motionの音数は2〜8の整数にしてください。",
    "A selectable safe Chord Context section has enough chord roots for the selected Root Motion chain; text cards are never treated as an original bassline.": "選択可能で安全なChord Contextセクションには、選択したRoot Motionチェーンに十分なコード・ルートがあります。テキストカードを元のベースラインとしては扱いません。",
  };
  return messages[reason];
}

function japaneseChordContextReason(reason: string): string | undefined {
  const messages: Record<string, string> = {
    "Chord Context requires a valid exact text result.": "Chord Contextには、有効で厳密なテキスト結果が必要です。",
    "Chord Context requires a user-confirmed key; an inferred key is only a suggestion.": "Chord Contextには、ユーザーが確認したキーが必要です。推定キーは候補にすぎません。",
    "Choose a BPM before Chord Context eligibility can be evaluated.": "Chord Contextの利用可否を評価する前に、BPMを選択してください。",
    "Chord Context supports BPM values from 30 through 240.": "Chord Contextは30〜240 BPMに対応しています。",
    "The saved progression has no complete contiguous 1, 2, 4, 8, or 12-bar 4/4 Chord Context section.": "保存される進行には、完全で連続した1・2・4・8・12小節の4/4 Chord Contextセクションがありません。",
    "The saved progression contains at least one complete contiguous 1, 2, 4, 8, or 12-bar 4/4 Chord Context section.": "保存される進行には、完全で連続した1・2・4・8・12小節の4/4 Chord Contextセクションが少なくとも1つあります。",
  };
  return messages[reason];
}
function parseExplicitBpm(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 30 && parsed <= 240 ? parsed : undefined;
}

function barLabel(bar: number, language: AppLanguage): string {
  return text(language, `Bar ${bar}`, `${bar}\u5c0f\u7bc0\u76ee`);
}
function timingLabel(event: TextProgressionEvent, language: AppLanguage): string {
  return text(
    language,
    `Bar ${event.bar}, beat ${event.startBeat}, ${event.durationBeats} beat${event.durationBeats === 1 ? "" : "s"}`,
    `${event.bar}\u5c0f\u7bc0\u76ee\u30fb${event.startBeat}\u62cd\u76ee\u30fb${event.durationBeats}\u62cd`,
  );
}
function tokenLocation(token: TextProgressionToken, language: AppLanguage): string {
  const chars = `${token.range.start + 1}-${token.range.end}`;
  return text(language, `bar ${token.bar}, characters ${chars}`, `${token.bar}\u5c0f\u7bc0\u76ee\u30fb\u6587\u5b57 ${chars}`);
}
function diagnosticLocation(diagnostic: TextProgressionDiagnostic, language: AppLanguage): string {
  const chars = `${diagnostic.range.start + 1}-${diagnostic.range.end}`;
  return diagnostic.bar === undefined
    ? text(language, `characters ${chars}`, `\u6587\u5b57 ${chars}`)
    : text(language, `bar ${diagnostic.bar}, characters ${chars}`, `${diagnostic.bar}\u5c0f\u7bc0\u76ee\u30fb\u6587\u5b57 ${chars}`);
}
function capabilityName(name: TextProgressionCapability["name"], language: AppLanguage): string {
  const names: Record<TextProgressionCapability["name"], readonly [string, string]> = {
    "vault-save": ["Vault Save", "Vault\u3078\u4fdd\u5b58"],
    "chord-dojo": ["Chord Dojo", "Chord Dojo"],
    "bass-practice": ["Bass Practice", "Bass Practice"],
    "chord-context": ["Chord Context", "Chord Context"],
    "root-motion": ["Root Motion", "Root Motion"],
    "voicing-memory": ["Voicing Memory", "\u30dc\u30a4\u30b7\u30f3\u30b0\u8a18\u61b6"],
  };
  return text(language, names[name][0], names[name][1]);
}
function text(language: AppLanguage, english: string, japanese: string): string {
  return language === "ja" ? japanese : english;
}