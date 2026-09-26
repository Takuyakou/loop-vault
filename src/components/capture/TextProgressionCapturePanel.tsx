import { useEffect, useMemo, useState } from "react";
import { playbackController, type PlaybackController } from "../../audio/playbackController";
import { standardTextPlaybackNotes } from "../../domain/standardTextPlayback";
import { useTextTransport } from "./useTextTransport";
import { TextTransportBar } from "./TextTransportBar";
import type { PreviewSound } from "../../audio/chordPreview";
import { romanNumeralHint } from "../../domain/harmony/romanNumerals";
import type { ExtendedTextResult } from "../../domain/extendedTextProgression";
import { ExtendedTextIntakePanel } from "./ExtendedTextIntakePanel";
import { TextCaptureShell } from "./TextCaptureShell";
import { StandardTextScoreWorkspace } from "./StandardTextScoreWorkspace";
import {
  confirmedTextProgressionKeyState,
  evaluateTextProgressionCapabilities,
  parseTextProgression,
  TEXT_PROGRESSION_MAX_BARS,
  TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS,
  TEXT_PROGRESSION_MAX_TOKENS,
  TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM,
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
import {
  createTextProgressionStyleSnapshot,
  isTextProgressionVoicingStyleId,
  TEXT_PROGRESSION_VOICING_STYLES,
  textProgressionStyleFromSnapshot,
  textProgressionVoicingNotes,
  type TextProgressionVoicingStyleId,
} from "../../domain/textProgressionVoicing";
import type { ChordVoicingMemory } from "../../domain/types";
import type { ManualCandidateDraft } from "../../domain/midi/manualDraft";
import type { AppLanguage } from "../../i18n";
import { VoicingPanel } from "../voicing/VoicingPanel";
import { BpmScrubField } from "../BpmScrubField";

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
  readonly onSaveStandard?: (converted: TextProgressionConvertedDraft, title: string) => boolean;
  readonly onSaveExtended?: (result: ExtendedTextResult, title: string) => boolean;
  readonly onPreview: (
    event: TextProgressionEvent,
    memory: ChordVoicingMemory | undefined,
    bpm: number,
  ) => void;
  readonly onStop: () => void;
  readonly controller?: PlaybackController;
  readonly previewSound?: PreviewSound;
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
  onSaveStandard,
  onSaveExtended,
  onPreview,
  onStop,
  controller,
  previewSound,
}: TextProgressionCapturePanelProps) {
  const [input, setInput] = useState("");
  const [dialect, setDialect] = useState<"standard" | "extended">("standard");
  const [keyInput, setKeyInput] = useState("");
  const [confirmedKey, setConfirmedKey] = useState<string>();
  const [keyError, setKeyError] = useState<string>();
  const [bpmInput, setBpmInput] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [selectedEventKey, setSelectedEventKey] = useState<string>();
  const [voicingOverrides, setVoicingOverrides] = useState<TextProgressionVoicingOverrides>(new Map());
  const [voicingStyles, setVoicingStyles] = useState<ReadonlyMap<string, TextProgressionVoicingStyleId>>(new Map());

  const result = useMemo(() => parseTextProgression(input, {
    keyState: confirmedTextProgressionKeyState(confirmedKey),
  }), [confirmedKey, input]);
  const explicitBpm = parseExplicitBpm(bpmInput);
  const { transport, state: transportState } = useTextTransport(
    controller ?? playbackController, previewSound ?? "electric-piano", "standard-text-whole");
  const playbackSnapshot = useMemo(() => ({
    notes: standardTextPlaybackNotes(result, voicingOverrides), lengthBeats: result.scoreLengthBeats,
    beatsPerBar: 4, sourceText: input,
  }), [input, result, voicingOverrides]);
  const capabilities = useMemo(
    () => evaluateTextProgressionCapabilities({ result, ...(explicitBpm === undefined ? {} : { bpm: explicitBpm }) }),
    [explicitBpm, result],
  );
  const selectedEvent = useMemo(() => result.events.find(
    (event) => textProgressionEventKey(event) === selectedEventKey,
  ) ?? result.events[0], [result.events, selectedEventKey]);
  const selectedKey = selectedEvent ? textProgressionEventKey(selectedEvent) : undefined;
  const selectedMemory = selectedKey === undefined ? undefined : voicingOverrides.get(selectedKey);
  const storedStyle = selectedEvent
    ? textProgressionStyleFromSnapshot(selectedMemory?.practiceVoicingOverride, selectedEvent.chord)
    : undefined;
  const selectedStyle = storedStyle
    ?? (selectedKey === undefined ? undefined : voicingStyles.get(selectedKey))
    ?? "generated-close";
  const selectedGeneratedNotes = useMemo(
    () => selectedEvent
      ? textProgressionVoicingNotes(selectedEvent.chord, selectedStyle) ?? []
      : [],
    [selectedEvent, selectedStyle],
  );
  const styleOptions = useMemo(
    () => TEXT_PROGRESSION_VOICING_STYLES.map((styleId) => ({
      value: styleId,
      label: voicingStyleLabel(styleId, language),
      disabled: selectedEvent === undefined
        || textProgressionVoicingNotes(selectedEvent.chord, styleId) === undefined,
    })),
    [language, selectedEvent],
  );
  const selectedStyleValue = selectedMemory?.practiceVoicingOverride?.source === "live-played"
    ? "live-custom"
    : selectedStyle;
  const selectedStyleOptions = useMemo(
    () => selectedStyleValue === "live-custom"
      ? [
          ...styleOptions,
          {
            value: "live-custom",
            label: text(language, "Keyboard capture", "鍵盤で記録"),
            disabled: true,
          },
        ]
      : styleOptions,
    [language, selectedStyleValue, styleOptions],
  );

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
    const key = textProgressionEventKey(event);
    const beat = (event.bar - 1) * 4 + event.startBeat - 1;
    transport.seek(beat);
    setSelectedEventKey(key);
    if (transportState.status !== "playing") {
      if (transportState.status === "stopped") onStop();
      onPreview(event, voicingOverrides.get(key), explicitBpm ?? TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM);
    }
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
    setVoicingStyles((current) => {
      const next = new Map(current);
      next.delete(selectedKey);
      return next;
    });
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

  function selectVoicingStyle(value: string) {
    if (
      draftActive
      || selectedKey === undefined
      || selectedEvent === undefined
      || !isTextProgressionVoicingStyleId(value)
    ) return;
    const snapshot = value === "generated-close"
      ? undefined
      : createTextProgressionStyleSnapshot(selectedEvent.chord, value);
    if (value !== "generated-close" && snapshot === undefined) return;
    onStop();
    setVoicingStyles((current) => {
      const next = new Map(current);
      if (value === "generated-close") next.delete(selectedKey);
      else next.set(selectedKey, value);
      return next;
    });
    setVoicingOverrides((current) => {
      const next = new Map(current);
      if (snapshot === undefined) next.delete(selectedKey);
      else next.set(selectedKey, { practiceVoicingOverride: snapshot });
      return next;
    });
  }

  function convertedDraft(): TextProgressionConvertedDraft {
    const draft = createTextProgressionDraft({ result, voicingOverrides });
    const key = result.keyState.kind === "confirmed" ? result.keyState.key : undefined;
    return {
      draft, title: textProgressionDraftTitle(result),
      ...(explicitBpm === undefined ? {} : { bpm: explicitBpm }),
      ...(key === undefined ? {} : { confirmedKey: key }),
    };
  }

  function convert() {
    if (draftActive || !result.canConvert) return;
    try { onConvert(convertedDraft()); } catch {
      // Keep the source text available if a future Draft invariant rejects it.
    }
  }

  function saveStandard() {
    if (draftActive || !result.canConvert || !onSaveStandard) return;
    try {
      const converted = convertedDraft();
      const success = onSaveStandard(converted, (titleEdited ? saveTitle : converted.title).trim());
      setSaved(success); setSaveFailed(!success);
    } catch { setSaved(false); setSaveFailed(true); }
  }

  function previewSelected() {
    if (draftActive || !selectedEvent) return;
    onPreview(selectedEvent, selectedMemory, explicitBpm ?? TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM);
  }

  const confirmed = result.keyState.kind === "confirmed";
  const suggestions = result.keyState.kind === "inferred" ? result.keyState.candidates : [];
  const disabled = draftActive;
  const modeSelector = (
    <div className="flex gap-2" role="group" aria-label={text(language, "Text syntax", "テキスト記法")}>
      <button type="button" className={dialect === "standard" ? "lv-button-primary px-3 py-2 text-sm" : "lv-button-secondary px-3 py-2 text-sm"}
        aria-pressed={dialect === "standard"} disabled={disabled} data-testid="text-mode-standard"
        onClick={() => { onStop(); setDialect("standard"); }}>
        {text(language, "Standard", "通常")}
      </button>
      <button type="button" className={dialect === "extended" ? "lv-button-primary px-3 py-2 text-sm" : "lv-button-secondary px-3 py-2 text-sm"}
        aria-pressed={dialect === "extended"} disabled={disabled} data-testid="text-mode-extended"
        onClick={() => { onStop(); setDialect("extended"); }}>
        {text(language, "Extended", "拡張")}
      </button>
    </div>
  );
  if (dialect === "extended") {
    return <TextCaptureShell language={language} dialect={dialect} draftActive={draftActive} modeSelector={modeSelector}>
      <ExtendedTextIntakePanel language={language} input={input} disabled={disabled}
        controller={controller} sound={previewSound}
        onInput={setInput}
        onSave={(extended, title) => onSaveExtended?.(extended, title) ?? false} />
    </TextCaptureShell>;
  }

  return (
    <TextCaptureShell language={language} dialect={dialect} draftActive={draftActive} modeSelector={modeSelector}>
      {/^(?:\s*#|\s*[<>]\s*$)/m.test(input) || /N\.C\./i.test(input) ? (
        <div className="mt-3 flex items-center gap-2 text-sm" data-testid="text-extended-suggestion">
          <span>{text(language, "This looks like extended notation.", "拡張記法の形式に見えます。")}</span>
          <button type="button" className="lv-button-secondary px-2 py-1" disabled={disabled}
            onClick={() => { onStop(); setDialect("extended"); }}>
            {text(language, "Read as Extended", "拡張で読む")}
          </button>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <TextTransportBar language={language} transport={transport} state={transportState}
          snapshot={playbackSnapshot} disabled={disabled || (transportState.status === "stopped" && !result.canConvert)}
          sourceMatches={transportState.snapshot?.sourceText === undefined || transportState.snapshot.sourceText === input} />
      </div>
      <StandardTextScoreWorkspace language={language} input={input} result={result} disabled={disabled}
        transport={transport} transportState={transportState}
        onInput={value => { if (transportState.status === "stopped") onStop();
          setSaved(false); setSaveFailed(false); setInput(value); }} onSelectEvent={selectEvent}
        onSeekBar={bar => transport.seek((bar - 1) * 4)} />
      <p id="text-progression-format" className="mt-2 text-xs text-[var(--lv-text-muted)]">
        {text(
          language,
          `4/4 only; each bar has 1, 2, or 4 cells; maximum ${TEXT_PROGRESSION_MAX_BARS} bars / ${TEXT_PROGRESSION_MAX_TOKENS} cells. % repeats, _ rests, = holds without re-attack.`,
          `4/4のみ。各小節は1・2・4セル、最大${TEXT_PROGRESSION_MAX_BARS}小節・${TEXT_PROGRESSION_MAX_TOKENS}セルです。% は再発音、_ は休符、= は再発音せず保持します。`,
        )}
      </p>

      <details className="mt-3 rounded border border-[var(--lv-border)] p-2" data-testid="standard-text-card-details">
        <summary className="cursor-pointer text-xs text-[var(--lv-text-muted)]">
          {text(language, "Card list and saved voicing details", "カード一覧と保存音の詳細")}
        </summary>
      <TextProgressionCards
        events={result.events}
        valid={result.canConvert}
        tokens={result.tokens}
        voicingOverrides={voicingOverrides}
        selectedKey={selectedKey}
        confirmedKey={confirmed ? result.keyState.key : undefined}
        showRomanNumerals={showRomanNumerals}
        language={language}
        disabled={disabled}
        onSelect={selectEvent}
      />

      </details>

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
          <BpmScrubField idPrefix="text-progression-bpm" inputTestId="text-progression-bpm"
            label="BPM" disabled={disabled} emptyWhenUnset={explicitBpm === undefined}
            dragLabel={text(language, "Drag up or down to change BPM", "上下にドラッグしてBPMを変更")}
            value={explicitBpm ?? TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM}
            onChange={value => { if (transportState.status === "stopped") onStop();
              transport.setBpm(value); setBpmInput(String(value)); }}
            onExplicitInput={value => { if (transportState.status === "stopped") onStop();
              transport.setBpm(value); setBpmInput(String(value)); }} />
          <p className="mt-2 text-xs text-[var(--lv-text-muted)]">
            {bpmInput && explicitBpm === undefined
              ? text(language, `Enter 30–240 BPM to change audition speed. Cards use ${TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM} BPM until then, and saving can still omit BPM.`, `試聴速度を変えるには30〜240 BPMを入力してください。それまではカードを${TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM} BPMで試聴し、保存時はBPMなしにもできます。`)
              : text(language, `Click a chord card to audition the exact notes currently planned for saving. Without BPM, audition uses ${TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM} BPM only.`, `コードカードをクリックすると、現在の保存予定音をそのまま試聴します。BPM未指定時は試聴だけ${TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM} BPMを使用します。`)}
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
                disabled={disabled}
                onClick={previewSelected}
              >
                {text(language, "Play notes to save", "保存予定音を再生")}
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
            {text(
              language,
              `Generated style: ${voicingStyleLabel(selectedStyle, language)}. It is not source MIDI.`,
              `生成スタイル: ${voicingStyleLabel(selectedStyle, language)}。元MIDIではありません。`,
            )}
          </p>
          <details className="mt-3" data-testid="text-progression-detail-expander">
            <summary className="cursor-pointer text-sm">{text(language, "Chord details", "コード詳細")}</summary>
          <VoicingPanel
            key={selectedKey}
            chord={selectedEvent.chord}
            memory={selectedMemory}
            generatedNotes={selectedGeneratedNotes}
            language={language}
            sourceAvailable={false}
            sourceApplicable={false}
            onMemoryChange={updateVoicing}
            onReextract={() => undefined}
            styleSelector={{
              value: selectedStyleValue,
              label: text(language, "Generated style", "生成スタイル"),
              options: selectedStyleOptions,
              onChange: selectVoicingStyle,
            }}
          />
          </details>
        </section>
      ) : null}

      <div className="lv-text-intake-savebar sticky bottom-0 z-10 mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--lv-border)] bg-[var(--lv-surface)] p-3">
        <span className="min-w-0 flex-1 text-xs text-[var(--lv-text-muted)]" data-testid="text-progression-capability-summary">
          {result.bars} {text(language, "bars", "小節")} · 4/4 · {explicitBpm ?? TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM} BPM
          {" · " + result.diagnostics.length + " " + text(language, "errors", "エラー")}
          {!confirmed ? " · " + text(language, "Confirm a key for Bass Practice / Chord Context / Root Motion", "キーを確定するとBass Practice / Chord Context / Root Motionを利用できます") : ""}
        </span>
        <details className="relative" data-testid="text-progression-capability-details">
          <summary className="cursor-pointer text-xs">{text(language, "Availability details", "利用条件の詳細")}</summary>
          <TextCapabilityList capabilities={capabilities} language={language} />
        </details>
        {onSaveStandard ? <label className="text-xs">{text(language, "Name", "名前")}
          <input className="lv-field-control ml-2 min-h-9 w-44 px-2" maxLength={80}
            data-testid="text-progression-name" value={titleEdited ? saveTitle : textProgressionDraftTitle(result)}
            onChange={event => { setTitleEdited(true); setSaveTitle(event.target.value);
              setSaved(false); setSaveFailed(false); }} />
        </label> : null}
        {onSaveStandard ? <button type="button" className="lv-button-primary min-h-9 px-4 text-sm"
          data-testid="text-progression-save" disabled={disabled || !result.canConvert}
          onClick={saveStandard}>{text(language, "Save to Vault", "Vaultに保存")}</button> : null}
        <button
          type="button"
          className="lv-button-secondary px-4 py-2 text-sm"
          data-testid="text-progression-convert"
          disabled={disabled || !result.canConvert}
          onClick={convert}
        >
          {text(language, "Advanced edit", "詳細編集")}
        </button>
        {saved ? <span role="status" className="text-xs text-[var(--lv-accent)]">
          {text(language, "Saved", "保存しました")}</span> : null}
        {saveFailed ? <span role="alert" className="text-xs text-[var(--lv-warning)]">
          {text(language, "Save failed. Your text is still here.", "保存できませんでした。入力内容は保持されています。")}</span> : null}
        {!result.canConvert ? <p className="text-xs text-[var(--lv-text-muted)]">
          {text(language, "Fix every diagnostic before saving. No partial progression is created.", "保存前にすべての診断を修正してください。部分進行は作成しません。")}
        </p> : null}
      </div>
    </TextCaptureShell>
  );
}

function TextProgressionCards({
  events,
  valid,
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
  readonly valid: boolean;
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
                if (!event && valid && (token.raw === "_" || token.raw === "=")) {
                  return (
                    <div key={`${token.index}:${token.range.start}`} className="min-w-0 border border-[var(--lv-border)] bg-[var(--lv-surface)] p-3" data-testid="text-progression-control-card">
                      <span className="block font-semibold">{token.raw === "_" ? text(language, "Rest", "休符") : text(language, "Hold", "保持（再発音なし）")}</span>
                      <span className="mt-1 block text-xs text-[var(--lv-text-muted)]">{tokenLocation(token, language)}</span>
                    </div>
                  );
                }
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
                const practice = voicingOverrides.get(key)?.practiceVoicingOverride;
                const styleId = textProgressionStyleFromSnapshot(practice, event.chord);
                const voicingState = practice?.source === "live-played"
                  ? text(language, "Custom / Live MIDI", "カスタム / Live MIDI")
                  : styleId
                    ? voicingStyleLabel(styleId, language)
                    : text(language, "Default / Generated", "標準 / 自動生成");
                const degree = confirmedKey && showRomanNumerals
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
                      {voicingState}
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
    "input-too-long": `テキスト進行入力は最大${TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS.toLocaleString("en-US")} UTF-16コード単位です。`,
    "unsupported-meter": "テキスト進行入力 v1 は4/4のみに対応しています。",
    "malformed-bar-notation": "小節表記は `|` で始まり `|` で終える必要があります。",
    "empty-bar": "空の小節はテキスト進行入力では使用できません。",
    "too-many-bars": `テキスト進行入力は最大${TEXT_PROGRESSION_MAX_BARS}小節です。`,
    "too-many-tokens": `テキスト進行入力は最大${TEXT_PROGRESSION_MAX_TOKENS}個のコード・トークンです。`,
    "three-chord-bar": "1小節に3つのコードは、v1の文法では正確に表現できません。",
    "invalid-chord-count": "4/4の各小節には、コード・トークンを1つ、2つ、または4つだけ入力できます。",
    "invalid-chord": "このトークンは対応するコード表記ではありません。",
    "invalid-control": "繰り返しには前のコードが必要です。保持は直前の発音中コードにのみ使用でき、先頭や休符の後には置けません。",
    "ambiguous-compact-progression": "この小節を一意に解釈できません。コード間に空白を入れてください。",
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
function voicingStyleLabel(styleId: TextProgressionVoicingStyleId, language: AppLanguage): string {
  const labels: Record<TextProgressionVoicingStyleId, readonly [string, string]> = {
    "generated-close": ["Default close", "標準クローズ"],
    "shell-17": ["Shell 1–7", "シェル 1–7"],
    "open-17": ["Open 1–7", "オープン 1–7"],
    "rootless-ab": ["Rootless A/B", "ルートレス A/B"],
  };
  return text(language, labels[styleId][0], labels[styleId][1]);
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
