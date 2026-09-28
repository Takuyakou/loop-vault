import { displayKey } from "../../domain/displayLabels";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReserveBottomSpace } from "../notifications";
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
import { textCaptureStatus, textCaptureSummary, textCaptureSaveReason } from "./textCaptureStatus";
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
import { VoicingPanel } from "../voicing/VoicingPanel";
import { BpmScrubField } from "../BpmScrubField";
import { usePreviewSound } from "../PreviewSoundProvider";
import { useMetronome } from "../MetronomeProvider";

export interface TextProgressionConvertedDraft {
  readonly draft: ManualCandidateDraft;
  readonly title: string;
  readonly bpm?: number;
  readonly confirmedKey?: string;
}

interface TextProgressionCapturePanelProps {
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
  const { sound: globalSound } = usePreviewSound();
  const { enabled: metronomeEnabled } = useMetronome();
  const selectedSound = previewSound ?? globalSound;
  const [input, setInput] = useState("");
  const editorSelection = useRef({ start: 0, end: 0 });
  const statusBarRef = useRef<HTMLElement>(null);
  useReserveBottomSpace(statusBarRef);
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
    controller ?? playbackController, selectedSound, "standard-text-whole");
  const playbackSnapshot = useMemo(() => ({
    notes: standardTextPlaybackNotes(result, voicingOverrides, metronomeEnabled), lengthBeats: result.scoreLengthBeats,
    beatsPerBar: 4, sourceText: input,
  }), [input, metronomeEnabled, result, voicingOverrides]);
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
      label: voicingStyleLabel(styleId),
      disabled: selectedEvent === undefined
        || textProgressionVoicingNotes(selectedEvent.chord, styleId) === undefined,
    })),
    [selectedEvent],
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
            label: "鍵盤で記録",
            disabled: true,
          },
        ]
      : styleOptions,
    [selectedStyleValue, styleOptions],
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
      setKeyError("C major のような対応キーを入力してください。");
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

  function switchDialect(next: "standard" | "extended") {
    const editor = document.querySelector<HTMLTextAreaElement>(dialect === "standard"
      ? "[data-testid='text-progression-input']" : "[data-testid='extended-text-input']");
    if (editor) editorSelection.current = { start: editor.selectionStart, end: editor.selectionEnd };
    onStop();
    setDialect(next);
  }

  function previewSelected() {
    if (draftActive || !selectedEvent) return;
    onPreview(selectedEvent, selectedMemory, explicitBpm ?? TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM);
  }

  const visibleDiagnostics = input.trim() ? result.diagnostics : [];
  const statusModel = textCaptureStatus({
    bars: result.bars, annotations: 0, meterLabel: "4/4", bpm: explicitBpm ?? null,
    keyLabel: confirmedKey ?? null, errors: visibleDiagnostics.length, warnings: 0,
    practiceLimits: 0, hasSource: Boolean(input.trim()),
  });
  const saveReason = textCaptureSaveReason(statusModel);
  const confirmed = result.keyState.kind === "confirmed";
  const suggestions = result.keyState.kind === "inferred" ? result.keyState.candidates : [];
  const disabled = draftActive;
  const modeSelector = (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={"テキスト記法"}>
      <span className="text-xs text-[var(--lv-text-muted)]">{"読み方"}</span>
      <button type="button" className="lv-button-secondary lv-choice px-3 py-2 text-sm"
        aria-pressed={dialect === "standard"} disabled={disabled} data-testid="text-mode-standard"
        onClick={() => switchDialect("standard")}>
        {"通常"}
      </button>
      <button type="button" className="lv-button-secondary lv-choice px-3 py-2 text-sm"
        aria-pressed={dialect === "extended"} disabled={disabled} data-testid="text-mode-extended"
        onClick={() => switchDialect("extended")}>
        {"拡張"}
      </button>
    </div>
  );
  if (dialect === "extended") {
    return <TextCaptureShell dialect={dialect} draftActive={draftActive}>
      <ExtendedTextIntakePanel input={input} disabled={disabled}
        controller={controller} sound={selectedSound} modeSelector={modeSelector}
        onInput={setInput} editorSelection={editorSelection.current}
        onEditorSelection={(start, end) => { editorSelection.current = { start, end }; }}
        onSave={(extended, title) => onSaveExtended?.(extended, title) ?? false} />
    </TextCaptureShell>;
  }

  return (
    <TextCaptureShell dialect={dialect} draftActive={draftActive}>
      {/^(?:\s*#|\s*[<>]\s*$)/m.test(input) || /N\.C\./i.test(input) ? (
        <div className="mt-3 flex items-center gap-2 text-sm" data-testid="text-extended-suggestion">
          <span>{"拡張記法の形式に見えます。"}</span>
          <button type="button" className="lv-button-secondary px-2 py-1" disabled={disabled}
            onClick={() => switchDialect("extended")}>
            {"拡張で読む"}
          </button>
        </div>
      ) : null}
      <div className="lv-text-intake-shell overflow-hidden bg-[var(--lv-surface)]" data-testid="standard-text-intake">
      <div className="lv-text-capture-toolbar lv-text-control-row flex items-center gap-2 border-b border-[var(--lv-border)] py-2" data-testid="text-capture-toolbar">
        {modeSelector}
        <label className="lv-text-toolbar-meter text-xs" title={"通常モードは4/4のみ"}>
          {"拍子"}
          <select disabled aria-label={"拍子"} title={"通常モードは4/4のみ"} value="4/4" onChange={() => undefined}><option>4/4</option></select>
        </label>
        <div className="lv-text-toolbar-key">
          <span className="text-xs">{"キー"}</span>
          <details className="lv-text-key-picker relative">
            <summary className="lv-field-control flex min-h-9 min-w-24 cursor-pointer list-none items-center justify-between gap-2 px-2 text-xs"
              data-testid="text-key-picker">{confirmedKey ?? "未確定"} <span aria-hidden="true">▾</span></summary>
            <div className="lv-text-key-menu absolute left-0 top-full z-40 min-w-64 border border-[var(--lv-border)] bg-[var(--lv-surface)] p-2 shadow-lg">
              <label htmlFor="text-progression-key" className="sr-only">{"キー"}</label>
              <input id="text-progression-key" list="text-progression-key-options" data-testid="text-progression-key"
                className="lv-field-control min-h-9 w-36 px-2 text-xs" value={keyInput} disabled={disabled}
                onChange={event => { onStop(); setKeyInput(event.target.value); }}
                placeholder={"未確定"} />
              <datalist id="text-progression-key-options">{["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].flatMap(root => ["major", "minor"].map(mode =>
                <option key={root + mode} value={root + " " + mode} />))}</datalist>
              <button type="button" className="lv-button-secondary ml-1 min-h-9 px-2 text-xs" disabled={disabled}
                aria-label={"キーを確定"} onClick={confirmKey}>
                {"確定"}</button>
              <button type="button" className="lv-button-ghost ml-1 min-h-9 px-1 text-xs" disabled={disabled || !confirmedKey}
                onClick={clearKey} title={"キーをクリア"}
                aria-label={"キーをクリア"}>×</button>
              {suggestions.length ? <div className="mt-2 flex flex-wrap gap-1" data-testid="text-progression-key-suggestions">
                {suggestions.map(candidate => <button key={candidate.key} type="button" className="lv-button-secondary px-2 py-1 text-xs"
                  disabled={disabled} title={candidate.key} onClick={() => chooseSuggestedKey(candidate.key)}>{displayKey(candidate.key) ?? candidate.key}</button>)}
              </div> : null}
            </div>
          </details>
        </div>
        <div className="lv-text-toolbar-bpm">
          <BpmScrubField idPrefix="text-progression-bpm" inputTestId="text-progression-bpm"
            label="BPM" disabled={disabled} emptyWhenUnset={explicitBpm === undefined}
            dragLabel={"上下にドラッグしてBPMを変更"}
            value={explicitBpm ?? TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM}
            onChange={value => { if (transportState.status === "stopped") onStop();
              transport.setBpm(value); setBpmInput(String(value)); }}
            onExplicitInput={value => { if (transportState.status === "stopped") onStop();
              transport.setBpm(value); setBpmInput(String(value)); }} />
          {explicitBpm === undefined ? <small className="whitespace-nowrap text-[var(--lv-text-muted)]">{"試聴120"}</small> : null}
        </div>
        <TextTransportBar transport={transport} state={transportState}
          snapshot={playbackSnapshot} disabled={disabled || (transportState.status === "stopped" && !result.canConvert)}
          sourceMatches={transportState.snapshot?.sourceText === undefined || transportState.snapshot.sourceText === input} />
        {onSaveStandard ? <div className="lv-text-toolbar-save flex shrink-0 items-center gap-1.5">
          <label className="text-xs">{"名前"}
            <input className="lv-field-control ml-1 min-h-9 w-24 px-2" maxLength={80}
              data-testid="text-progression-name" value={titleEdited ? saveTitle : textProgressionDraftTitle(result)}
              onChange={event => { setTitleEdited(true); setSaveTitle(event.target.value);
                setSaved(false); setSaveFailed(false); }} />
          </label>
          <button type="button" className="lv-button-primary min-h-9 whitespace-nowrap px-2 text-xs"
            data-testid="text-progression-save" disabled={disabled || !result.canConvert}
            title={!result.canConvert ? saveReason : undefined}
            aria-describedby={!result.canConvert ? "text-progression-save-reason" : undefined}
            onClick={saveStandard}>{"Vaultに保存"}</button>
          {!result.canConvert ? <span tabIndex={0} role="note" aria-describedby="text-progression-save-reason"
            title={saveReason}
            className="cursor-help text-xs text-[var(--lv-text-secondary)]" data-testid="text-save-blocked-hint">ⓘ</span> : null}
        </div> : null}
      </div>
      <StandardTextScoreWorkspace input={input} result={result} statusModel={statusModel} disabled={disabled}
        editorSelection={editorSelection.current}
        onEditorSelection={(start, end) => { editorSelection.current = { start, end }; }}
        transport={transport} transportState={transportState}
        onInput={value => { if (transportState.status === "stopped") onStop();
          setSaved(false); setSaveFailed(false); setInput(value); }} onSelectEvent={selectEvent}
        onSeekBar={bar => transport.seek((bar - 1) * 4)} />
      <p id="text-progression-format" className="sr-only text-[var(--lv-text-muted)]">
        {`4/4のみ。各小節は1・2・4セル、最大${TEXT_PROGRESSION_MAX_BARS}小節・${TEXT_PROGRESSION_MAX_TOKENS}セルです。% は再発音、_ は休符、= は再発音せず保持します。`}
      </p>

      <span className="sr-only" data-testid="text-progression-key-state">
        {confirmed ? `確定: ${result.keyState.key}`
          : "明示的に確定したキーだけがローマ数字・数字入力と度数表示に使われます。"}
      </span>
      {keyError ? <p role="alert" className="mt-1 text-xs text-[var(--lv-danger)]">{keyError}</p> : null}

      <TextDiagnostics diagnostics={visibleDiagnostics} />

      <footer ref={statusBarRef} className="lv-text-intake-savebar lv-text-status-bar flex items-center gap-3 border-t border-[var(--lv-border)] px-2 text-xs">
        <span className="min-w-0 font-mono text-[var(--lv-text-muted)]" data-testid="text-progression-capability-summary" data-text-status-summary>
          {textCaptureSummary(statusModel)}
        </span>
        {result.tokens.length ? <details name="capture-details" className="lv-text-detail-popover" data-testid="standard-text-card-details">
          <summary className="cursor-pointer text-xs text-[var(--lv-text-muted)]">
            {"カード一覧"}
          </summary>
          <TextProgressionCards
            events={result.events}
            valid={result.canConvert}
            tokens={result.tokens}
            voicingOverrides={voicingOverrides}
            selectedKey={selectedKey}
            confirmedKey={confirmed ? result.keyState.key : undefined}
            showRomanNumerals={showRomanNumerals}
            disabled={disabled}
            onSelect={selectEvent}
          />
        </details> : null}
        {selectedEvent && !draftActive ? (
          <details name="capture-details" className="lv-text-detail-popover" data-testid="text-progression-inspector">
            <summary className="cursor-pointer whitespace-nowrap text-[var(--lv-text-muted)]">{"選択音"}: <span className="font-mono">{selectedEvent.canonical}</span></summary>
            <div className="lv-text-inspector-content border border-[var(--lv-border)] bg-[var(--lv-surface)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">
                  {"選択中のコード"}
                </p>
                <h3 className="mt-1 font-mono text-xl font-semibold">{selectedEvent.canonical}</h3>
                <p className="mt-1 text-sm text-[var(--lv-text-muted)]">
                  {timingLabel(selectedEvent)}
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
                  {"保存予定音を再生"}
                </button>
                <button
                  type="button"
                  className="lv-button-ghost px-3 py-2 text-sm"
                  disabled={disabled}
                  onClick={onStop}
                >
                  {"停止"}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--lv-text-muted)]" data-testid="text-progression-auto-generated">
              {`生成スタイル: ${voicingStyleLabel(selectedStyle)}。元MIDIではありません。`}
            </p>
            <details className="mt-3" data-testid="text-progression-detail-expander">
              <summary className="cursor-pointer text-sm">{"コード詳細"}</summary>
            <VoicingPanel
              key={selectedKey}
              chord={selectedEvent.chord}
              memory={selectedMemory}
              generatedNotes={selectedGeneratedNotes}
              sourceAvailable={false}
              sourceApplicable={false}
              onMemoryChange={updateVoicing}
              onReextract={() => undefined}
              styleSelector={{
                value: selectedStyleValue,
                label: "生成スタイル",
                options: selectedStyleOptions,
                onChange: selectVoicingStyle,
              }}
            />
            </details>
            </div>
          </details>
        ) : null}
        <details name="capture-details" className="relative ml-auto" data-testid="text-progression-capability-details">
          <summary className="cursor-pointer whitespace-nowrap text-[var(--lv-text-muted)]">{"利用条件"}</summary>
          <TextCapabilityList capabilities={capabilities} />
        </details>
        <button type="button" className="lv-button-ghost whitespace-nowrap text-xs" data-testid="text-progression-convert"
          disabled={disabled || !result.canConvert} onClick={convert}>{"詳細編集"}</button>
        {saved ? <span role="status" className="text-[var(--lv-accent)]">{"保存しました"}</span> : null}
        {saveFailed ? <span role="alert" className="text-[var(--lv-danger)]">
          {"保存できませんでした。入力内容は保持されています。"}</span> : null}
        <span id="text-progression-save-reason" className="lv-text-save-reason min-w-0 truncate text-[var(--lv-text-muted)]">{saveReason}</span>
      </footer>
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
    <section className="mt-4" aria-label={"\u89e3\u6790\u6e08\u307f\u30b3\u30fc\u30c9"}>
      <div className="space-y-3">
        {[...bars.entries()].map(([bar, barTokens]) => (
          <section
            key={bar}
            role="group"
            aria-label={barLabel(bar)}
            data-testid="text-progression-bar"
            className="border-l-2 border-[var(--lv-border)] pl-3"
          >
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--lv-text-muted)]">
              {barLabel(bar)}
            </h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {barTokens.map((token) => {
                const event = eventsByToken.get(`${token.bar}:${token.range.start}:${token.range.end}`);
                if (!event && valid && (token.raw === "_" || token.raw === "=")) {
                  return (
                    <div key={`${token.index}:${token.range.start}`} className="min-w-0 border border-[var(--lv-border)] bg-[var(--lv-surface)] p-3" data-testid="text-progression-control-card">
                      <span className="block font-semibold">{token.raw === "_" ? "休符" : "保持（再発音なし）"}</span>
                      <span className="mt-1 block text-xs text-[var(--lv-text-muted)]">{tokenLocation(token)}</span>
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
                        {"\u4fee\u6b63\u304c\u5fc5\u8981"}
                      </span>
                      <span className="mt-1 block text-xs text-[var(--lv-text-muted)]">
                        {tokenLocation(token)}
                      </span>
                    </div>
                  );
                }
                const key = textProgressionEventKey(event);
                const practice = voicingOverrides.get(key)?.practiceVoicingOverride;
                const styleId = textProgressionStyleFromSnapshot(practice, event.chord);
                const voicingState = practice?.source === "live-played"
                  ? "カスタム / Live MIDI"
                  : styleId
                    ? voicingStyleLabel(styleId)
                    : "標準 / 自動生成";
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
                    <span className="block font-mono font-semibold text-[var(--lv-text)]">{event.canonical}</span>
                    <span className="mt-1 block text-xs text-[var(--lv-text-muted)]">{timingLabel(event)}</span>
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
}: {
  readonly diagnostics: readonly TextProgressionDiagnostic[];
}) {
  if (!diagnostics.length) return null;
  return (
    <section id="text-progression-diagnostics" className="mt-2 border-l-2 border-[var(--lv-danger)] px-3 py-1 text-xs" role="status" aria-live="polite" data-testid="text-progression-diagnostics">
      <h3 className="font-semibold text-[var(--lv-danger)]">{"変換前に修正"}</h3>
      <ul className="mt-1 space-y-1 text-[var(--lv-text-secondary)]">
        {diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}:${diagnostic.range.start}:${index}`} className="min-w-0 break-words [overflow-wrap:anywhere]">
            <span className="font-medium">{diagnosticLocation(diagnostic)}: </span>
            {diagnosticMessage(diagnostic)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function TextCapabilityList({
  capabilities,
}: {
  readonly capabilities: readonly TextProgressionCapability[];
}) {
  return (
    <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2" data-testid="text-progression-capabilities">
      {capabilities.map((capability) => (
        <div key={capability.name} className="border border-[var(--lv-border)] px-3 py-2">
          <dt className="font-semibold text-[var(--lv-text)]">{capabilityName(capability.name)}</dt>
          <dd className="mt-1 text-[var(--lv-text-muted)]" data-capability-status={capability.status}>
            {capabilityStatus(capability.status)}: {capabilityReason(capability)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function diagnosticMessage(diagnostic: TextProgressionDiagnostic): string {
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
): string {
  const japanese: Record<TextProgressionCapability["status"], string> = {
    supported: "利用可能",
    unsupported: "利用不可",
    unknown: "未判定",
  };
  return japanese[status];
}

function capabilityReason(capability: TextProgressionCapability): string {
  const direct = japaneseCapabilityReason(capability.reason);
  if (direct !== undefined) return direct;

  const bassPractice = /^Bass Practice is (supported|unsupported|unknown): (.+)$/.exec(capability.reason);
  if (bassPractice) {
    const upstream = japaneseChordContextReason(bassPractice[2]!)
      ?? "コードコンテキストの利用条件を確認してください。";
    return `コードコンテキストの条件により、Bass Practiceは${capabilityStatus(capability.status)}です。${upstream}`;
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

  return `${capabilityName(capability.name)}の利用可否は現在「${capabilityStatus(capability.status)}」です。`;
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
function voicingStyleLabel(styleId: TextProgressionVoicingStyleId): string {
  const labels: Record<TextProgressionVoicingStyleId, string> = {
    "generated-close": "標準クローズ",
    "shell-17": "シェル 1–7",
    "open-17": "オープン 1–7",
    "rootless-ab": "ルートレス A/B",
  };
  return labels[styleId];
}

function parseExplicitBpm(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 30 && parsed <= 240 ? parsed : undefined;
}

function barLabel(bar: number): string {
  return `${bar}\u5c0f\u7bc0\u76ee`;
}
function timingLabel(event: TextProgressionEvent): string {
  return `${event.bar}\u5c0f\u7bc0\u76ee\u30fb${event.startBeat}\u62cd\u76ee\u30fb${event.durationBeats}\u62cd`;
}
function tokenLocation(token: TextProgressionToken): string {
  const chars = `${token.range.start + 1}-${token.range.end}`;
  return `${token.bar}\u5c0f\u7bc0\u76ee\u30fb\u6587\u5b57 ${chars}`;
}
function diagnosticLocation(diagnostic: TextProgressionDiagnostic): string {
  const chars = `${diagnostic.range.start + 1}-${diagnostic.range.end}`;
  return diagnostic.bar === undefined
    ? `\u6587\u5b57 ${chars}`
    : `${diagnostic.bar}\u5c0f\u7bc0\u76ee\u30fb\u6587\u5b57 ${chars}`;
}
function capabilityName(name: TextProgressionCapability["name"]): string {
  const names: Record<TextProgressionCapability["name"], string> = {
    "vault-save": "Vault\u3078\u4fdd\u5b58",
    "chord-dojo": "Chord Dojo",
    "bass-practice": "Bass Practice",
    "chord-context": "Chord Context",
    "root-motion": "Root Motion",
    "voicing-memory": "\u30dc\u30a4\u30b7\u30f3\u30b0\u8a18\u61b6",
  };
  return names[name];
}
