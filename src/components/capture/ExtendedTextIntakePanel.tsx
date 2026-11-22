import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useSaveButtonState } from "../ui";
import { cardHarmony } from "../correction-workspace/cardHarmony";
import { displayChordLabel } from "../../ui/chordText";
import { displayKey } from "../../domain/displayLabels";
import { importKeyLabel, resolveImportKey, type ImportKeyChoice } from "../../domain/importKeyResolution";
import { confirmedTextProgressionKeyState } from "../../domain/textProgression";
import {
  parseExtendedTextProgression,
  type ExtendedTextMetadata,
  type ExtendedTextResult,
  type ExtendedTextReasonCode,
  type TextSourceRange,
} from "../../domain/extendedTextProgression";
import { buildTextPreviewScore } from "../../domain/textPreviewScore";
import { extendedTextPlaybackNotes } from "../../domain/extendedTextPlayback";
import { textPreviewNotes, textVoicingAvailability } from "../../domain/textVoicingAvailability";
import { TextVoicingAvailability } from "./TextVoicingAvailability";
import { evaluateExtendedTextPractice } from "../../domain/extendedTextPractice";
import { playbackController, type PlaybackController } from "../../audio/playbackController";
import type { PreviewSound } from "../../audio/chordPreview";
import { useTextTransport } from "./useTextTransport";
import { TextTransportBar } from "./TextTransportBar";
import { useTextScorePlayhead } from "./useTextScorePlayhead";
import { BpmScrubField } from "../BpmScrubField";
import { TextPreviewBar } from "./TextPreviewBar";
import { usePreviewSound } from "../PreviewSoundProvider";
import { useMetronome } from "../MetronomeProvider";
import { useGlobalBpm } from "../GlobalBpmProvider";
import { textCaptureStatus, textCaptureSummary, textCaptureSaveReason } from "./textCaptureStatus";
import { TextCapturePreviewStatus } from "./TextCapturePreviewStatus";
import { TEXT_CAPTURE_DEFAULT_NAME, TextKeySelect, TextMeterSelect, textSaveBlockedReason } from "./TextCaptureFields";

/** P23-17 V4/C10: the example in the empty input; it must read with no errors. */
export const EXTENDED_TEXT_PLACEHOLDER = "例: | Cmaj7 | Dm7 G7 | Cmaj7 % | Am7 _ |";

interface Props {
  readonly input: string;
  readonly modeSelector: ReactNode;
  readonly editorSelection: { readonly start: number; readonly end: number };
  readonly onEditorSelection: (start: number, end: number) => void;
  readonly disabled: boolean;
  readonly onInput: (value: string) => void;
  /** P23-33: the third argument is the effective (auto/inherited/manual) key for display and save. */
  readonly onSave: (result: ExtendedTextResult, title: string, resolvedKey?: string) => boolean;
  readonly controller?: PlaybackController;
  readonly sound?: PreviewSound;
  /** P23-17 V8: the 「度数を表示」 setting (the extended gets the same degree cards). */
  readonly showRomanNumerals?: boolean;
}

const japaneseDiagnostic: Readonly<Record<ExtendedTextReasonCode, string>> = {
  UNKNOWN_TOKEN: "読み取れない記号・トークンがあります。入力を確認してください。",
  UNKNOWN_CHORD: "このコード表記は対応していません。表記を確認してください。",
  AMBIGUOUS_TOKENIZATION: "コードの区切り方を一意に決められません。空白か小節線で区切ってください。",
  INVALID_STRUCTURE: "小節内の区切り・保持・スラッシュ等の書式を確認してください。",
  UNSUPPORTED_SUBDIVISION: "この等分割は正確なタイミングで表現できません。",
  INPUT_LIMIT_EXCEEDED: "入力が対応する長さ・小節数・イベント数の上限を超えています。長い曲は、A部分・B部分などのセクションごとに分けて取り込んでください。",
  UNSUPPORTED_METER: "対応する拍子は1/4から12/4です。",
  INVALID_METADATA: "拍子以外の設定値を確認してください。",
};

/** Comment hints never change authored metadata until the person applies them. */
export function detectExtendedTextMetadataHints(input: string): { key?: string; bpm?: number } {
  const key = /^\s*#\s*Key\s*:\s*(.+?)\s*$/im.exec(input)?.[1];
  const rawBpm = /^\s*#\s*BPM\s*:\s*(\d+(?:\.\d+)?)\s*$/im.exec(input)?.[1];
  const bpm = rawBpm === undefined ? undefined : Number(rawBpm);
  return {
    ...(key === undefined ? {} : { key }),
    ...(bpm !== undefined && Number.isFinite(bpm) && bpm >= 30 && bpm <= 240 ? { bpm } : {}),
  };
}

export function ExtendedTextIntakePanel({ input, disabled, onInput, onSave, editorSelection, onEditorSelection, modeSelector,
  controller = playbackController, sound, showRomanNumerals = true }: Props) {
  const { sound: globalSound } = usePreviewSound();
  const { enabled: metronome } = useMetronome();
  const { bpm: globalBpm } = useGlobalBpm();
  const selectedSound = sound ?? globalSound;
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
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
  const [beat, setBeat] = useState("4/4");
  // P23-33: the select's three states; the manual key is the one the parse and the original-text
  // validation use, the resolved key is what the save and the preview use.
  const [keyChoice, setKeyChoice] = useState<ImportKeyChoice>({ kind: "auto" });
  const manualKey = keyChoice.kind === "manual" ? keyChoice.key : undefined;
  const [bpm, setBpm] = useState<number>();
  const [matchGlobalBpm, setMatchGlobalBpm] = useState(false);
  /** V6: the field's value, or the common BPM when the field is empty or matched. */
  const playbackBpm = bpm === undefined || matchGlobalBpm ? globalBpm : bpm;
  const [playError, setPlayError] = useState<string>();
  const { transport, state: transportState } = useTextTransport(controller, selectedSound, "extended-text-whole");
  useEffect(() => { transport.setBpm(playbackBpm); }, [playbackBpm, transport]);
  const [name, setName] = useState(TEXT_CAPTURE_DEFAULT_NAME);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveBtn = useSaveButtonState();
  const [visiblePane, setVisiblePane] = useState<"input" | "preview">("input");
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { textareaRef.current?.setSelectionRange(editorSelection.start, editorSelection.end); }, []);
  const previewRef = useRef<HTMLElement>(null);
  const [selectedStart, setSelectedStart] = useState<number>();
  const hints = useMemo(() => detectExtendedTextMetadataHints(input), [input]);
  const metadata: ExtendedTextMetadata = useMemo(() => ({
    beat,
    ...(manualKey === undefined ? {} : { key: manualKey, confirmed: true }),
    ...(bpm === undefined ? {} : { bpm }),
  }), [beat, manualKey, bpm]);
  const result = useMemo(() => parseExtendedTextProgression(input, metadata), [input, metadata]);
  const keyChords = useMemo(() => result.harmonicSpans.map(span => span.chord), [result]);
  const keyDecision = useMemo(() => resolveImportKey({
    mode: keyChoice.kind,
    ...(keyChoice.kind === "manual" ? { manualKey: keyChoice.key } : {}),
    chords: keyChords,
  }), [keyChoice, keyChords]);
  // P23-17 V8 / P23-33: the degree and role of the extended preview cards, from the effective key.
  const harmony = useMemo(() => cardHarmony(
    result.harmonicSpans.map(span => ({ id: String(span.sourceSpan.start), name: span.chord, start: span.sourceSpan.start })),
    keyDecision.key,
  ), [result, keyDecision.key]);
  const harmonyFor = (start: number) => {
    const own = keyDecision.key && showRomanNumerals ? harmony.get(String(start)) : undefined;
    const span = result.harmonicSpans.find(item => item.sourceSpan.start === start);
    if (!own && !span) return undefined;
    return {
      ...(own?.degree ? { degree: own.degree } : {}),
      ...(own?.role ? { role: own.role } : {}),
      ...(span ? { name: displayChordLabel(span.writtenChord) } : {}),
    };
  };
  const scoreItems = useMemo(() => buildTextPreviewScore(result), [result]);
  const registration = useMemo(() => textVoicingAvailability(result.harmonicSpans), [result]);
  const playbackSnapshot = useMemo(() => ({
    notes: extendedTextPlaybackNotes(result, metronome), lengthBeats: result.scoreLengthBeats,
    beatsPerBar: result.beatsPerBar, sourceText: input,
  }), [input, metronome, result]);
  const sourceMatches = transportState.snapshot?.sourceText === undefined
    || transportState.snapshot.sourceText === input;
  useTextScorePlayhead(previewRef, transport, transportState,
    result.beatsPerBar, result.bars.length, sourceMatches);
  const practiceStatus = useMemo(() => result.canConvert
    ? evaluateExtendedTextPractice(result, playbackBpm) : undefined, [result, playbackBpm]);
  const errors = result.diagnostics.filter(issue => issue.severity === "ERROR");
  const warnings = result.diagnostics.filter(issue => issue.severity === "WARNING");
  const annotationCount = result.sections.filter(section => section.kind === "comment"
    && !/^\s*#\s*(Key|BPM)\s*:/i.test(section.raw)).length;
  const statusModel = textCaptureStatus({
    bars: result.bars.length, annotations: annotationCount, meterLabel: beat, bpm: bpm ?? null,
    keyLabel: keyDecision.key === undefined ? null : displayKey(keyDecision.key) ?? keyDecision.key,
    errors: input.trim() ? errors.length : 0,
    warnings: input.trim() ? warnings.length : 0,
    practiceLimits: practiceStatus?.ready === false ? 1 : 0, hasSource: Boolean(input.trim()),
  });
  const chooseKeyChoice = (choice: string | undefined) => {    if (!choice || choice === "auto") { setKeyChoice({ kind: "auto" }); return; }
    if (choice === "unset") { setKeyChoice({ kind: "unset" }); return; }
    const state = confirmedTextProgressionKeyState(choice);
    setKeyChoice(state.kind === "confirmed" ? { kind: "manual", key: state.key } : { kind: "auto" });
  };
  const saveReason = textCaptureSaveReason(statusModel);
  const saveBlocked = textSaveBlockedReason(result.canConvert, saveReason, name);
  const lines = input.split(/\r\n|\r|\n/);
  const diagnosticLines = new Map<number, "ERROR" | "WARNING">();
  for (const issue of result.diagnostics) if (issue.severity !== "INFO") {
    if (issue.severity === "ERROR" || !diagnosticLines.has(issue.line)) {
      diagnosticLines.set(issue.line, issue.severity);
    }
  }
  const pendingClass = "rounded border border-[var(--lv-border)] bg-[var(--lv-bg)] px-2 py-1 text-xs text-[var(--lv-text-secondary)]";
  const appliedClass = "lv-button-secondary px-3 py-2 text-sm";

  function auditionSpan(span: TextSourceRange) {
    const harmonic = result.harmonicSpans.find(item => item.sourceSpan.start === span.start
      || item.attacks.some(attack => attack.span.start === span.start));
    if (!harmonic || !sourceMatches) return;
    const notes = textPreviewNotes(harmonic.chord);
    if (!notes.length) { setPlayError("試聴の音を作れません: " + harmonic.chord.label); return; }
    const attack = harmonic.attacks.find(item => item.span.start === span.start);
    transport.seek(attack?.beat ?? harmonic.startBeat);
    if (transportState.status === "playing") return;
    void controller.toggle({ kind: "capture", id: "extended-text-band:" + span.start },
      { type: "chord", chord: harmonic.chord, sound: selectedSound, explicitMidiNotes: notes }).catch(error => {
      setPlayError(error instanceof Error ? error.message : String(error));
    });
  }

  function save() {
    if (disabled || !result.canConvert || !name.trim()) return;
    try {
      const success = onSave(result, name.trim(), keyDecision.key);
      setSaveFailed(!success);
      setSaved(success);
      if (success) saveBtn.succeed();
      else saveBtn.reset();
    } catch {
      setSaveFailed(true);
      setSaved(false);
      saveBtn.reset();
    }
  }

  function selectSource(span: TextSourceRange) {
    setSelectedStart(span.start);
    setVisiblePane("input");
    const editor = textareaRef.current;
    if (!editor) return;
    editor.focus();
    editor.setSelectionRange(span.start, span.end);
    onEditorSelection(span.start, span.end);
    const line = input.slice(0, span.start).split(/\r\n|\r|\n/).length - 1;
    editor.scrollTop = Math.max(0, line * 24 - editor.clientHeight / 3);
    if (gutterRef.current) gutterRef.current.scrollTop = editor.scrollTop;
  }

  function selectPreviewAtCaret(position: number) {
    const span = result.harmonicSpans.find(item => position >= item.sourceSpan.start && position < item.sourceSpan.end)?.sourceSpan
      ?? result.barSourceSpans.find(item => position >= item.start && position <= item.end);
    if (!span) return;
    setSelectedStart(span.start);
    previewRef.current?.querySelector<HTMLElement>('[data-source-start="' + span.start + '"]')?.scrollIntoView?.({ block: "nearest" });
  }

  return (
    <div data-testid="extended-text-intake" className="lv-text-intake-shell overflow-hidden bg-[var(--lv-surface)]">
      <div className="lv-text-capture-toolbar lv-text-topbar" data-testid="text-capture-toolbar">
        <section className="lv-text-topgroup" aria-label="読み方の設定">
          <span className="lv-text-toplabel">{"読み方の設定"}</span>
          {modeSelector}
          <TextMeterSelect testId="extended-text-meter" value={beat} disabled={disabled}
            options={Array.from({ length: 12 }, (_, index) => String(index + 1) + "/4")} onChange={setBeat} />
          <TextKeySelect testId="extended-text-key" value={keyChoice.kind === "manual" ? keyChoice.key : keyChoice.kind}
            disabled={disabled} allowAuto autoLabel={importKeyLabel(keyDecision)} onChange={chooseKeyChoice} />
          <div className="lv-text-toolbar-bpm"><BpmScrubField idPrefix="text-intake-bpm" label="BPM" disabled={disabled} emptyWhenUnset={bpm === undefined}
            dragLabel={"上下にドラッグしてBPMを変更"}
            value={bpm ?? globalBpm} onChange={value => {
              setMatchGlobalBpm(false); setBpm(value);
            }} onExplicitInput={value => {
              setMatchGlobalBpm(false); setBpm(value);
            }} />
          {bpm === undefined ? <span className="text-xs text-[var(--lv-text-muted)]">{`試聴 ${globalBpm}`}</span> : (
            <button type="button" className="lv-text-bpm-match" aria-pressed={matchGlobalBpm}
              aria-label={matchGlobalBpm ? "曲の BPM に戻す" : "共通の BPM に合わせる"}
              title={matchGlobalBpm ? `曲の BPM（${bpm}）で鳴らす` : `上の帯の共通 BPM（${globalBpm}）で鳴らす。保存する BPM は変わりません`}
              data-testid="text-match-global-bpm" onClick={() => setMatchGlobalBpm(value => !value)}>
              {matchGlobalBpm ? "曲の BPM に戻す" : "共通の BPM に合わせる"}
            </button>
          )}</div>
          <div className="lv-text-top-help" ref={helpRef}>
            <button type="button" className="lv-text-help-button" data-testid="text-help" aria-expanded={helpOpen}
              aria-label="説明" title="説明" onClick={() => setHelpOpen(open => !open)}>{"?"}</button>
            {helpOpen ? (
              <div className="lv-text-help-face" role="dialog" aria-label="説明" data-testid="text-help-face">
                {result.canConvert ? <TextVoicingAvailability availability={registration} /> : null}
                <p className="lv-text-help-line">{"拍子は 1/4 から 12/4 まで選べます。小節は | で区切り、コードは空白で区切ります。% は再発音、_ は休符、= は再発音せず保持します。"}</p>
                <p className="lv-text-help-line">{"# Key: や # BPM: の行は案として出るだけで、選ぶまで使いません。明示的に確定したキーだけがローマ数字・数字入力と度数表示に使われます。"}</p>
              </div>
            ) : null}
          </div>
        </section>
        <section className="lv-text-topgroup" aria-label="試聴">
          <span className="lv-text-toplabel">{"試聴"}</span>
          <TextTransportBar transport={transport} state={transportState}
            snapshot={playbackSnapshot} disabled={disabled || (transportState.status === "stopped" && !result.canConvert)}
            sourceMatches={sourceMatches} primaryTestId="extended-text-play"
            frozenTestId="extended-text-frozen-playback" />
          {playError ? <span role="alert" className="text-xs text-[var(--lv-danger)]">{playError}</span> : null}
        </section>
      </div>

      <div className="lv-text-intake-tabs border-b border-[var(--lv-border)] p-2" role="tablist"
        aria-label={"テキスト作業領域"}>
        <button type="button" role="tab" aria-selected={visiblePane === "input"}
          className="lv-button-secondary lv-choice px-3 py-2"
          onClick={() => setVisiblePane("input")}>{"入力"}</button>
        <button type="button" role="tab" aria-selected={visiblePane === "preview"}
          className="lv-button-secondary lv-choice px-3 py-2"
          onClick={() => setVisiblePane("preview")}>{"プレビュー"}</button>
      </div>

      <div className="lv-text-intake-grid">
        <section className={"lv-text-intake-pane min-w-0 border-r border-[var(--lv-border)] p-3" + (visiblePane === "input" ? " lv-text-intake-pane-active" : "")}
          aria-label={"元テキストの入力"} data-testid="extended-text-editor">
          <div className="lv-text-pane-head mb-3 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="extended-text-input" className="flex flex-wrap items-baseline gap-2 text-sm font-semibold">{"進行テキスト"}
              <span className="text-xs font-normal text-[var(--lv-text-muted)]">{"小節は | で区切る。コードは空白で区切る。% は再発音、_ は休符、= は保持。1/4〜12/4"}</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {hints.key ? <button type="button" className={manualKey === hints.key ? appliedClass : pendingClass}
                disabled={disabled || manualKey === hints.key} onClick={() => chooseKeyChoice(hints.key)}>
                {manualKey === hints.key
                  ? ("キー " + (displayKey(hints.key) ?? hints.key) + " 使用中")
                  : ("キー " + (displayKey(hints.key) ?? hints.key) + "を使う")}
              </button> : null}
              {hints.bpm !== undefined ? <button type="button" className={bpm === hints.bpm ? appliedClass : pendingClass}
                disabled={disabled || bpm === hints.bpm}
                onClick={() => { if (hints.bpm !== undefined) {
                  setMatchGlobalBpm(false); setBpm(hints.bpm);
                } }}>
                {bpm === hints.bpm
                  ? ("BPM " + hints.bpm + " 使用中")
                  : ("BPM " + hints.bpm + "を使う")}
              </button> : null}
            </div>
          </div>
          <div className="lv-text-intake-editor relative flex overflow-hidden bg-[var(--lv-surface)]">
            <div ref={gutterRef} aria-hidden="true" className="lv-text-intake-gutter shrink-0 overflow-hidden border-r border-[var(--lv-border)] text-right font-mono text-xs text-[var(--lv-text-muted)]">
              {lines.map((line, index) => <div key={index}
                className={/^\s*#/.test(line) ? "text-[var(--lv-accent)]" : ""}
                data-diagnostic={diagnosticLines.get(index + 1) ?? ""}>
                {index + 1}{diagnosticLines.get(index + 1)
                  ? <span className={diagnosticLines.get(index + 1) === "ERROR"
                    ? "ml-0.5 text-[var(--lv-danger)]" : "ml-0.5 text-[var(--lv-warning)]"}>!</span>
                  : null}
              </div>)}
            </div>
            <textarea id="extended-text-input" data-testid="extended-text-input" value={input} ref={textareaRef}
              disabled={disabled} spellCheck={false}
              placeholder={EXTENDED_TEXT_PLACEHOLDER}
              aria-invalid={errors.length > 0}
              aria-describedby="extended-text-diagnostics"
              onScroll={event => { if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop; }}
              onSelect={event => { onEditorSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
                selectPreviewAtCaret(event.currentTarget.selectionStart); }}
              onClick={event => selectPreviewAtCaret(event.currentTarget.selectionStart)}
              onKeyUp={event => selectPreviewAtCaret(event.currentTarget.selectionStart)}
              onChange={event => {
                const value = event.currentTarget.value;
                // P23-17 V14: after a save, clearing the whole input starts the next progression from the first values.
                if (saved && value.trim() === "") { setKeyChoice({ kind: "auto" }); setBpm(undefined); setName(TEXT_CAPTURE_DEFAULT_NAME); }
                setSaveFailed(false); setSaved(false); saveBtn.reset(); onInput(value);
              }}
              className="lv-text-intake-textarea min-w-0 flex-1 resize-none overflow-auto bg-transparent p-2 font-mono text-sm outline-none" />
          </div>
          {(keyDecision.key || bpm !== undefined) ? <p className="mt-2 text-xs text-[var(--lv-text-muted)]" data-testid="extended-text-metadata">
            {keyDecision.key ? "キー " + (displayKey(keyDecision.key) ?? keyDecision.key) : ""}{keyDecision.key && bpm !== undefined ? " · " : ""}{bpm !== undefined ? "BPM " + String(bpm) : ""}
          </p> : null}
        </section>
        <section ref={previewRef} aria-label={"入力中のプレビュー"}
          className={"lv-text-intake-pane min-w-0 p-3" + (visiblePane === "preview" ? " lv-text-intake-pane-active" : "")}
          data-testid="extended-text-preview">
          <div className="lv-text-pane-head mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{"プレビュー"}</h3>
            <span className="text-xs text-[var(--lv-text-muted)]">{result.bars.length} {"小節"}</span>
            <TextCapturePreviewStatus model={statusModel} />
          </div>
          <div className="lv-text-preview-scroll" data-testid="extended-text-preview-scroll">
          {practiceStatus?.ready === false ? <p data-testid="extended-text-practice-limit"
            className="mb-2 text-sm text-[var(--lv-warning)]">
            {"保存できますが、Voicing Loopではこのタイミングを練習できません: "}{practiceStatus.reason}
          </p> : null}
          {result.state === "EMPTY" ? <p className="grid min-h-64 place-items-center text-center text-sm text-[var(--lv-text-muted)]">{"コード進行を入力すると、ここに譜面が表示されます"}</p> : null}
          {scoreItems.map((item, index) => item.kind === "annotation"
            ? <button type="button" key={index} data-testid="extended-text-section"
                data-source-start={item.sourceSpan.start}
                className="mt-3 block w-full border-l-2 border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] p-2 text-left text-xs"
                onClick={() => selectSource(item.sourceSpan)}>{item.text}</button>
            : <div key={index} className="lv-text-intake-bars mt-2" data-testid="text-preview-row">
                {item.bars.map(bar => <TextPreviewBar key={bar.number} bar={bar}
                  selectedStart={selectedStart} onSelect={selectSource} onAudition={auditionSpan}
                  harmonyFor={harmonyFor} disabled={disabled}
                  onBarSelect={span => { selectSource(span); if (sourceMatches) {
                    transport.seek((bar.number - 1) * result.beatsPerBar);
                  } }}
                  errorLabel={bar.error ? japaneseDiagnostic[bar.error] : undefined} />)}
              </div>)}
          {errors[0] ? <button type="button" className="lv-button-secondary mt-2 px-2 py-1 text-xs"
            onClick={() => selectSource(errors[0]!.span)}>
            {"最初のエラーへ"}
          </button> : null}
          <div id="extended-text-diagnostics" role="status" aria-live="polite" className="mt-3"
            data-testid="extended-text-diagnostics">
            {result.diagnostics.map((diagnostic, index) => <p key={String(diagnostic.span.start) + ":" + String(index)}
              className={"mt-1 text-sm " + (diagnostic.severity === "ERROR" ? "text-[var(--lv-danger)]" : "text-[var(--lv-warning)]")}
              data-reason={diagnostic.reasonCode} data-span-start={diagnostic.span.start}
              data-span-end={diagnostic.span.end}>
              {diagnostic.severity} {diagnostic.line}:{diagnostic.column} [{diagnostic.span.start}-{diagnostic.span.end}] · {japaneseDiagnostic[diagnostic.reasonCode]}
            </p>)}
          </div>
          </div>
        </section>
      </div>

      <footer className="lv-text-intake-savebar lv-text-status-bar flex flex-wrap items-center gap-3 border-t border-[var(--lv-border)] px-2 py-1 text-xs">
        <label className="lv-text-footer-name flex items-center gap-1.5">{"名前"}
          <input className="lv-field-control min-h-8 w-28 px-2" maxLength={80} data-testid="extended-text-name"
            value={name} onChange={event => { setName(event.target.value); setSaved(false); saveBtn.reset(); setSaveFailed(false); }} />
        </label>
        <span className="min-w-0 font-mono text-[var(--lv-text-muted)]" data-text-status-summary>
          {textCaptureSummary(statusModel)}
        </span>
        {/* Same place as in 通常; the capability list and the Draft editor exist only for 通常. */}
        <button type="button" className="lv-button-ghost ml-auto whitespace-nowrap text-xs" disabled
          aria-label="使える機能" title={"拡張の読み方では表示できません（通常の読み方で使えます）"} data-testid="extended-text-capabilities-unavailable">{"?"}</button>
        <button type="button" className="lv-button-ghost whitespace-nowrap text-xs" disabled data-testid="extended-text-convert-unavailable"
          title={"拡張の読み方では使えません（通常の読み方で使えます）"}>{"音を細かく直す"}</button>
        {saveFailed ? <span role="alert" className="text-[var(--lv-danger)]">
          {"保存できませんでした。入力内容は保持されています。"}
        </span> : null}
        <span id="extended-text-save-reason" className="lv-text-save-reason min-w-0 truncate text-[var(--lv-text-muted)]">
          {saveReason}
        </span>
        {saveBlocked !== undefined ? <span tabIndex={0} role="note" aria-describedby="extended-text-save-reason" title={saveBlocked}
          className="cursor-help text-[var(--lv-text-secondary)]" data-testid="text-save-blocked-hint">{"ⓘ"}</span> : null}
        <button type="button" className="lv-button-primary min-h-9 whitespace-nowrap px-3 text-xs" data-testid="extended-text-save"
          data-save-state={saveBtn.state}
          disabled={disabled || saveBlocked !== undefined} title={saveBlocked}
          aria-describedby={saveBlocked !== undefined ? "extended-text-save-reason" : undefined} onClick={save}>
          {saveBtn.state === "busy" ? <><span className="lv-save-spin" aria-hidden="true" /><span>保存中…</span></>
            : saveBtn.state === "done" ? <><Check aria-hidden="true" size={16} /><span>保存しました</span></>
            : "Vault に保存"}
        </button>
      </footer>
    </div>
  );
}
