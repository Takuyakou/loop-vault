import { useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useSaveButtonState } from "../ui";
import { useReserveBottomSpace } from "../notifications";
import { playbackController, type PlaybackController } from "../../audio/playbackController";
import { standardTextPlaybackNotes } from "../../domain/standardTextPlayback";
import { textPreviewNotes, textVoicingAvailability } from "../../domain/textVoicingAvailability";
import { TextVoicingAvailability } from "./TextVoicingAvailability";
import { useTextTransport } from "./useTextTransport";
import { TextTransportBar } from "./TextTransportBar";
import type { PreviewSound } from "../../audio/chordPreview";
import { formatMidiNoteForDisplay } from "../music-keyboard";
import { displayChordLabel } from "../../ui/chordText";
import { displayKey } from "../../domain/displayLabels";
import { importKeyLabel, resolveImportKey, type ImportKeyChoice } from "../../domain/importKeyResolution";
import type { ExtendedTextResult } from "../../domain/extendedTextProgression";
import { ExtendedTextIntakePanel } from "./ExtendedTextIntakePanel";
import { TextCaptureShell } from "./TextCaptureShell";
import { TEXT_CAPTURE_DEFAULT_NAME, TextKeySelect, TextMeterSelect, textSaveBlockedReason } from "./TextCaptureFields";
import { StandardTextScoreWorkspace } from "./StandardTextScoreWorkspace";
import { textCaptureStatus, textCaptureSummary, textCaptureSaveReason } from "./textCaptureStatus";
import {
  confirmedTextProgressionKeyState,
  evaluateTextProgressionCapabilities,
  parseTextProgression,
  TEXT_PROGRESSION_MAX_BARS,
  TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS,
  TEXT_PROGRESSION_MAX_TOKENS,
  type TextProgressionCapability,
  type TextProgressionDiagnostic,
  type TextProgressionEvent,
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
import { cardHarmony } from "../correction-workspace/cardHarmony";
import { useMetronome } from "../MetronomeProvider";
import { useGlobalBpm } from "../GlobalBpmProvider";

export interface TextProgressionConvertedDraft {
  readonly draft: ManualCandidateDraft;
  readonly title: string;
  readonly bpm?: number;
  readonly confirmedKey?: string;
  /** P23-33: the effective key (manual, inherited or inferred) for the save and the display. */
  readonly resolvedKey?: string;
}

interface TextProgressionCapturePanelProps {
  readonly showRomanNumerals: boolean;
  /** Once converted, the existing ManualCandidateDraft is authoritative. */
  readonly draftActive?: boolean;
  readonly onConvert: (converted: TextProgressionConvertedDraft) => void;
  readonly onSaveStandard?: (converted: TextProgressionConvertedDraft, title: string) => boolean;
  /** P23-33: the third argument is the effective (auto/inherited/manual) key for save and reload. */
  readonly onSaveExtended?: (result: ExtendedTextResult, title: string, resolvedKey?: string) => boolean;
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
  const { bpm: globalBpm } = useGlobalBpm();
  const selectedSound = previewSound ?? globalSound;
  const [input, setInput] = useState("");
  const editorSelection = useRef({ start: 0, end: 0 });
  const statusBarRef = useRef<HTMLElement>(null);
  useReserveBottomSpace(statusBarRef);
  const [dialect, setDialect] = useState<"standard" | "extended">("standard");
  const [keyChoice, setKeyChoice] = useState<ImportKeyChoice>({ kind: "auto" });
  const [bpmInput, setBpmInput] = useState("");
  const [matchGlobalBpm, setMatchGlobalBpm] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const [saveTitle, setSaveTitle] = useState(TEXT_CAPTURE_DEFAULT_NAME);
  const [saved, setSaved] = useState(false);
  const saveBtn = useSaveButtonState();
  const [saveFailed, setSaveFailed] = useState(false);
  const [selectedEventKey, setSelectedEventKey] = useState<string>();
  const [voicingOverrides, setVoicingOverrides] = useState<TextProgressionVoicingOverrides>(new Map());
  const [voicingStyles, setVoicingStyles] = useState<ReadonlyMap<string, TextProgressionVoicingStyleId>>(new Map());

  const manualKey = keyChoice.kind === "manual" ? keyChoice.key : undefined;
  // P23-33: the parse keeps using only a human-chosen key (degrees and roman numerals need one); the
  // effective key for display and save is resolved separately below, from the parsed absolute chords.
  const result = useMemo(() => parseTextProgression(input, {
    keyState: confirmedTextProgressionKeyState(manualKey),
  }), [manualKey, input]);
  const keyChords = useMemo(() => result.events.map(event => event.chord), [result]);
  const keyDecision = useMemo(() => resolveImportKey({
    mode: keyChoice.kind,
    ...(keyChoice.kind === "manual" ? { manualKey: keyChoice.key } : {}),
    chords: keyChords,
  }), [keyChoice, keyChords]);
  const explicitBpm = parseExplicitBpm(bpmInput);
  /** V6: the field's value when it has one, the common BPM while 「共通の BPM に合わせる」 is on, and the common BPM when the field is empty. */
  const playbackBpm = explicitBpm === undefined || matchGlobalBpm ? globalBpm : explicitBpm;
  const { transport, state: transportState } = useTextTransport(
    controller ?? playbackController, selectedSound, "standard-text-whole");
  useEffect(() => {
    if (!helpOpen) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setHelpOpen(false); } };
    const onDown = (event: MouseEvent) => {
      if (helpRef.current && event.target instanceof Node && !helpRef.current.contains(event.target)) setHelpOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [helpOpen]);
  useEffect(() => { transport.setBpm(playbackBpm); }, [playbackBpm, transport]);
  const playbackSnapshot = useMemo(() => ({
    notes: standardTextPlaybackNotes(result, voicingOverrides, metronomeEnabled), lengthBeats: result.scoreLengthBeats,
    beatsPerBar: 4, sourceText: input,
  }), [input, metronomeEnabled, result, voicingOverrides]);
  const capabilities = useMemo(
    () => evaluateTextProgressionCapabilities({ result, ...(explicitBpm === undefined ? {} : { bpm: explicitBpm }) }),
    [explicitBpm, result],
  );
  const registration = useMemo(() => textVoicingAvailability(result.events.map(event => ({
    chord: event.chord, memory: voicingOverrides.get(textProgressionEventKey(event)),
  }))), [result, voicingOverrides]);
  const selectedEvent = useMemo(() => result.events.find(
    (event) => textProgressionEventKey(event) === selectedEventKey,
  ) ?? result.events[0], [result.events, selectedEventKey]);
  const selectedKey = selectedEvent ? textProgressionEventKey(selectedEvent) : undefined;
  const selectedMemory = selectedKey === undefined ? undefined : voicingOverrides.get(selectedKey);
  const storedStyle = selectedEvent
    ? textProgressionStyleFromSnapshot(selectedMemory?.practiceVoicingOverride, selectedEvent.chord)
    : undefined;
  // P23-17 V7/V8/V9: the degree, role and voicing mark of the preview cards (the card list is gone).
  const harmony = useMemo(() => cardHarmony(
    result.events.map(event => ({ id: String(event.range.start), name: event.chord, start: event.range.start })),
    keyDecision.key,
  ), [result, keyDecision.key]);
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
      if (textPreviewNotes(event.chord, voicingOverrides.get(key)).length) {
        onPreview(event, voicingOverrides.get(key), playbackBpm);
      }
    }
  }

  /** 「自動」keeps the key automatic; 「未設定」is the explicit no-key choice; a key is a manual pick. */
  function chooseKeyChoice(choice: string | undefined) {
    if (draftActive) return;
    onStop();
    if (choice === "auto") { setKeyChoice({ kind: "auto" }); return; }
    if (choice === "unset" || !choice) { setKeyChoice({ kind: "unset" }); return; }
    const state = confirmedTextProgressionKeyState(choice);
    setKeyChoice(state.kind === "confirmed" ? { kind: "manual", key: state.key } : { kind: "auto" });
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
    return {
      draft, title: textProgressionDraftTitle(result),
      ...(explicitBpm === undefined ? {} : { bpm: explicitBpm }),
      // P23-33: the human's parse key and the effective (auto/inherited/manual) save key are separate.
      ...(manualKey === undefined ? {} : { confirmedKey: manualKey }),
      ...(keyDecision.key === undefined ? {} : { resolvedKey: keyDecision.key }),
    };
  }

  function convert() {
    if (draftActive || !result.canConvert) return;
    try { onConvert(convertedDraft()); } catch {
      // Keep the source text available if a future Draft invariant rejects it.
    }
  }

  function saveStandard() {
    if (draftActive || !result.canConvert || !onSaveStandard || !saveTitle.trim()) return;
    try {
      const converted = convertedDraft();
      const success = onSaveStandard(converted, saveTitle.trim());
      setSaved(success);
      if (success) saveBtn.succeed();
      else saveBtn.reset();
      setSaveFailed(!success);
    } catch { setSaved(false); saveBtn.reset(); setSaveFailed(true); }
  }

  function switchDialect(next: "standard" | "extended") {
    const editor = document.querySelector<HTMLTextAreaElement>(dialect === "standard"
      ? "[data-testid='text-progression-input']" : "[data-testid='extended-text-input']");
    if (editor) editorSelection.current = { start: editor.selectionStart, end: editor.selectionEnd };
    onStop();
    setDialect(next);
  }

  function previewSelected() {
    if (draftActive || !selectedEvent || !textPreviewNotes(selectedEvent.chord, selectedMemory).length) return;
    onPreview(selectedEvent, selectedMemory, playbackBpm);
  }

  const visibleDiagnostics = input.trim() ? result.diagnostics : [];
  const statusModel = textCaptureStatus({
    bars: result.bars, annotations: 0, meterLabel: "4/4", bpm: explicitBpm ?? null,
    keyLabel: keyDecision.key === undefined ? null : displayKey(keyDecision.key) ?? keyDecision.key,
    errors: visibleDiagnostics.length, warnings: 0,
    practiceLimits: 0, hasSource: Boolean(input.trim()),
  });
  const saveReason = textCaptureSaveReason(statusModel);
  const saveBlocked = textSaveBlockedReason(result.canConvert, saveReason, saveTitle);
  const confirmed = keyDecision.key !== undefined;
  const keySelectValue = keyChoice.kind === "manual" ? keyChoice.key : keyChoice.kind;
  const disabled = draftActive;
  /** P23-17 V8/V9: what a preview card shows above and below its chord name. */
  const harmonyFor = (sourceStart: number) => {
    const own = confirmed && showRomanNumerals ? harmony.get(String(sourceStart)) : undefined;
    const event = result.events.find(item => item.range.start === sourceStart);
    const practice = event ? voicingOverrides.get(textProgressionEventKey(event))?.practiceVoicingOverride : undefined;
    const styleId = event ? textProgressionStyleFromSnapshot(practice, event.chord) : undefined;
    const voicing = practice?.source === "live-played" ? "カスタム / Live MIDI"
      : styleId ? voicingStyleLabel(styleId) : event ? "標準 / 自動生成" : undefined;
    if (!own && !voicing && !event) return undefined;
    return {
      ...(own?.degree ? { degree: own.degree } : {}),
      ...(own?.role ? { role: own.role } : {}),
      ...(voicing ? { voicing } : {}),
      ...(event ? { name: displayChordLabel(event.canonical) } : {}),
    };
  };
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
        showRomanNumerals={showRomanNumerals}
        onInput={setInput} editorSelection={editorSelection.current}
        onEditorSelection={(start, end) => { editorSelection.current = { start, end }; }}
        onSave={(extended, title, resolvedKey) => onSaveExtended?.(extended, title, resolvedKey) ?? false} />
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
      <div className="lv-text-capture-toolbar lv-text-topbar" data-testid="text-capture-toolbar">
        <section className="lv-text-topgroup" aria-label="読み方の設定">
          <span className="lv-text-toplabel">{"読み方の設定"}</span>
          {modeSelector}
          <TextMeterSelect testId="text-progression-meter" value="4/4" options={["4/4"]} disabled
            reason={"通常の読み方は4/4だけです。ほかの拍子は拡張で使えます"} onChange={() => undefined} />
          <TextKeySelect testId="text-progression-key" value={keySelectValue} disabled={disabled}
            allowAuto autoLabel={importKeyLabel(keyDecision)} onChange={chooseKeyChoice} />
          <div className="lv-text-toolbar-bpm">
            <BpmScrubField idPrefix="text-progression-bpm" inputTestId="text-progression-bpm"
              label="BPM" disabled={disabled} emptyWhenUnset={explicitBpm === undefined}
              dragLabel={"上下にドラッグしてBPMを変更"}
              value={explicitBpm ?? globalBpm}
              onChange={value => { if (transportState.status === "stopped") onStop();
                setMatchGlobalBpm(false); setBpmInput(String(value)); }}
              onExplicitInput={value => { if (transportState.status === "stopped") onStop();
                setMatchGlobalBpm(false); setBpmInput(String(value)); }} />
            {explicitBpm === undefined ? <small className="whitespace-nowrap text-[var(--lv-text-muted)]">{`試聴 ${globalBpm}`}</small> : (
              <button type="button" className="lv-text-bpm-match" aria-pressed={matchGlobalBpm}
                aria-label={matchGlobalBpm ? "曲の BPM に戻す" : "共通の BPM に合わせる"}
                title={matchGlobalBpm ? `曲の BPM（${explicitBpm}）で鳴らす` : `上の帯の共通 BPM（${globalBpm}）で鳴らす。保存する BPM は変わりません`}
                data-testid="text-match-global-bpm" onClick={() => setMatchGlobalBpm(value => !value)}>
                {matchGlobalBpm ? "曲の BPM に戻す" : "共通の BPM に合わせる"}
              </button>
            )}
          </div>
          <div className="lv-text-top-help" ref={helpRef}>
            <button type="button" className="lv-text-help-button" data-testid="text-help" aria-expanded={helpOpen}
              aria-label="説明" title="説明" onClick={() => setHelpOpen(open => !open)}>{"?"}</button>
            {helpOpen ? (
              <div className="lv-text-help-face" role="dialog" aria-label="説明" data-testid="text-help-face">
                {result.canConvert ? <TextVoicingAvailability availability={registration} /> : null}
                <p className="lv-text-help-line">{"通常の読み方は4/4だけです。ほかの拍子は拡張で使えます"}</p>
                <p className="lv-text-help-line">{`4/4のみ。各小節は1・2・4セル、最大${TEXT_PROGRESSION_MAX_BARS}小節・${TEXT_PROGRESSION_MAX_TOKENS}セルです。% は再発音、_ は休符、= は再発音せず保持します。`}</p>
                <p className="lv-text-help-line">{"キーは自動で決まり、手で選ぶと固定されます。「自動」に戻すと選び直します。「未設定」にすると自動でも付けません。"}</p>
                <p className="lv-text-help-line">{"自動のキーは、3つ以上の異なる和音があり、その全部が同じキーに合い、候補が1つに絞れた時だけ付きます。ローマ数字・数字の入力には、これまでどおり手で選んだキーが必要です。"}</p>
              </div>
            ) : null}
          </div>
        </section>
        <section className="lv-text-topgroup" aria-label="試聴">
          <span className="lv-text-toplabel">{"試聴"}</span>
          <TextTransportBar transport={transport} state={transportState}
            snapshot={playbackSnapshot} disabled={disabled || (transportState.status === "stopped" && !result.canConvert)}
            sourceMatches={transportState.snapshot?.sourceText === undefined || transportState.snapshot.sourceText === input} />
        </section>
      </div>
      <StandardTextScoreWorkspace input={input} result={result} statusModel={statusModel} disabled={disabled}
        editorSelection={editorSelection.current}
        onEditorSelection={(start, end) => { editorSelection.current = { start, end }; }}
        transport={transport} transportState={transportState}
        harmonyFor={harmonyFor}
        onInput={value => { if (transportState.status === "stopped") onStop();
          // P23-17 V14: after a save, clearing the whole input starts the next progression from the first values.
          if (saved && value.trim() === "") {
            setKeyChoice({ kind: "auto" }); setBpmInput(""); setSaveTitle(TEXT_CAPTURE_DEFAULT_NAME);
          }
          setSaved(false); saveBtn.reset(); setSaveFailed(false); setInput(value); }} onSelectEvent={selectEvent}
        onSeekBar={bar => transport.seek((bar - 1) * 4)} />
      {/* P23-17 V11: the chosen card is a row under the preview; the row opens to the old contents. A score with no
          chords (rests only) keeps the way to 「音を細かく直す」 here, so that path is not lost. */}
      {!draftActive && (selectedEvent || (result.canConvert && result.events.length === 0)) ? (
        <div className="lv-text-selected-row" data-testid="text-progression-inspector-row">
          {selectedEvent ? (
          <details name="capture-details" className="lv-text-selected-details" data-testid="text-progression-inspector">
            <summary className="cursor-pointer text-xs">
              <span className="font-semibold">{"選んだカード: "}<span className="font-mono">{selectedEvent.canonical}</span></span>
              <span className="lv-text-selected-notes">
                {`鳴らす音 ${textPreviewNotes(selectedEvent.chord, selectedMemory).map(note => formatMidiNoteForDisplay(note, "fl-studio", "flat")).join("・")}(アプリのおすすめの音。元の MIDI の音ではありません)`}
              </span>
            </summary>
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
                  disabled={disabled || !textPreviewNotes(selectedEvent.chord, selectedMemory).length}
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
          ) : <span className="lv-text-selected-notes">{"コードのない進行です(休符だけ)"}</span>}
          <button type="button" className="lv-button-ghost whitespace-nowrap text-xs" data-testid="text-progression-convert"
            title={result.canConvert ? "コードと長さを1つずつ直してから保存します" : "正しいコード進行を入れると使えます"}
            disabled={disabled || !result.canConvert} onClick={convert}>{"音を細かく直す"}</button>
        </div>
      ) : null}
      <p id="text-progression-format" className="sr-only text-[var(--lv-text-muted)]">
        {`4/4のみ。各小節は1・2・4セル、最大${TEXT_PROGRESSION_MAX_BARS}小節・${TEXT_PROGRESSION_MAX_TOKENS}セルです。% は再発音、_ は休符、= は再発音せず保持します。`}
      </p>

      <span className="sr-only" data-testid="text-progression-key-state">
        {keyDecision.key
          ? `${keyChoice.kind === "auto" ? "自動" : "確定"}: ${keyDecision.key}`
          : "キーは未確定です。ローマ数字・数字の表記には、キーを選んでください。"}
      </span>

      <TextDiagnostics diagnostics={visibleDiagnostics} />

      <footer ref={statusBarRef} className="lv-text-intake-savebar lv-text-status-bar flex flex-wrap items-center gap-3 border-t border-[var(--lv-border)] px-2 py-1 text-xs">
        <label className="lv-text-footer-name flex items-center gap-1.5">{"名前"}
          <input className="lv-field-control min-h-8 w-28 px-2" maxLength={80} data-testid="text-progression-name"
            value={saveTitle} onChange={event => { setSaveTitle(event.target.value); setSaved(false); saveBtn.reset(); setSaveFailed(false); }} />
        </label>
        <span className="min-w-0 font-mono text-[var(--lv-text-muted)]" data-testid="text-progression-capability-summary" data-text-status-summary>
          {textCaptureSummary(statusModel)}
        </span>
        <details name="capture-details" className="relative ml-auto" data-testid="text-progression-capability-details">
          <summary className="cursor-pointer whitespace-nowrap text-[var(--lv-text-muted)]" aria-label="使える機能"
            title={"この進行を保存したあと、どの練習や機能で使えるか"}>{"?"}</summary>
          <TextCapabilityList capabilities={capabilities} />
        </details>
        {saveFailed ? <span role="alert" className="text-[var(--lv-danger)]">
          {"保存できませんでした。入力内容は保持されています。"}</span> : null}
        <span id="text-progression-save-reason" className="lv-text-save-reason min-w-0 truncate text-[var(--lv-text-muted)]">{saveReason}</span>
        {saveBlocked !== undefined ? <span tabIndex={0} role="note" aria-describedby="text-progression-save-reason" title={saveBlocked}
          className="cursor-help text-[var(--lv-text-secondary)]" data-testid="text-save-blocked-hint">{"ⓘ"}</span> : null}
        {onSaveStandard ? <button type="button" className="lv-button-primary min-h-9 whitespace-nowrap px-3 text-xs" data-testid="text-progression-save"
          data-save-state={saveBtn.state}
          disabled={disabled || saveBlocked !== undefined} title={saveBlocked}
          aria-describedby={saveBlocked !== undefined ? "text-progression-save-reason" : undefined} onClick={saveStandard}>
          {saveBtn.state === "busy" ? <><span className="lv-save-spin" aria-hidden="true" /><span>保存中…</span></>
            : saveBtn.state === "done" ? <><Check aria-hidden="true" size={16} /><span>保存しました</span></>
            : "Vault に保存"}
        </button> : null}
      </footer>
      </div>
    </TextCaptureShell>
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
    "too-many-bars": `テキスト進行入力は最大${TEXT_PROGRESSION_MAX_BARS}小節です。長い曲は、A部分・B部分などのセクションごとに分けて取り込んでください。`,
    "too-many-tokens": `テキスト進行入力は最大${TEXT_PROGRESSION_MAX_TOKENS}個のコード・トークンです。長い曲は、セクションごとに分けて取り込んでください。`,
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

function timingLabel(event: TextProgressionEvent): string {
  return `${event.bar}\u5c0f\u7bc0\u76ee\u30fb${event.startBeat}\u62cd\u76ee\u30fb${event.durationBeats}\u62cd`;
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
