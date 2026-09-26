import { useMemo, useRef, useState } from "react";
import {
  parseExtendedTextProgression,
  type ExtendedTextMetadata,
  type ExtendedTextResult,
  type ExtendedTextReasonCode,
  type TextSourceRange,
} from "../../domain/extendedTextProgression";
import { buildTextPreviewScore } from "../../domain/textPreviewScore";
import { extendedTextPlaybackNotes } from "../../domain/extendedTextPlayback";
import { evaluateExtendedTextPractice } from "../../domain/extendedTextPractice";
import { playbackController, type PlaybackController } from "../../audio/playbackController";
import type { PreviewSound } from "../../audio/chordPreview";
import { useTextTransport } from "./useTextTransport";
import { TextTransportBar } from "./TextTransportBar";
import { useTextScorePlayhead } from "./useTextScorePlayhead";
import type { AppLanguage } from "../../i18n";
import { BpmScrubField } from "../BpmScrubField";
import { TextPreviewBar } from "./TextPreviewBar";
import { usePreviewSound } from "../PreviewSoundProvider";
import { useMetronome } from "../MetronomeProvider";

interface Props {
  readonly language: AppLanguage;
  readonly input: string;
  readonly disabled: boolean;
  readonly onInput: (value: string) => void;
  readonly onSave: (result: ExtendedTextResult, title: string) => boolean;
  readonly controller?: PlaybackController;
  readonly sound?: PreviewSound;
}

function label(language: AppLanguage, english: string, japanese: string): string {
  return language === "ja" ? japanese : english;
}

const japaneseDiagnostic: Readonly<Record<ExtendedTextReasonCode, string>> = {
  UNKNOWN_TOKEN: "読み取れない記号・トークンがあります。入力を確認してください。",
  UNKNOWN_CHORD: "このコード表記は対応していません。表記を確認してください。",
  AMBIGUOUS_TOKENIZATION: "コードの区切り方を一意に決められません。空白か小節線で区切ってください。",
  INVALID_STRUCTURE: "小節内の区切り・保持・スラッシュ等の書式を確認してください。",
  UNSUPPORTED_SUBDIVISION: "この等分割は正確なタイミングで表現できません。",
  INPUT_LIMIT_EXCEEDED: "入力が対応する長さ・小節数・イベント数の上限を超えています。",
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

export function ExtendedTextIntakePanel({ language, input, disabled, onInput, onSave,
  controller = playbackController, sound }: Props) {
  const { sound: globalSound } = usePreviewSound();
  const { enabled: metronome } = useMetronome();
  const selectedSound = sound ?? globalSound;
  const [beat, setBeat] = useState("4/4");
  const [key, setKey] = useState<string>();
  const [bpm, setBpm] = useState<number>();
  const [practiceBpm, setPracticeBpm] = useState(120);
  const [playError, setPlayError] = useState<string>();
  const { transport, state: transportState } = useTextTransport(controller, selectedSound, "extended-text-whole");
  const [name, setName] = useState(label(language, "Text progression", "テキスト進行"));
  const [saveFailed, setSaveFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [visiblePane, setVisiblePane] = useState<"input" | "preview">("input");
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const [selectedStart, setSelectedStart] = useState<number>();
  const hints = useMemo(() => detectExtendedTextMetadataHints(input), [input]);
  const metadata: ExtendedTextMetadata = useMemo(() => ({
    beat,
    ...(key === undefined ? {} : { key, confirmed: true }),
    ...(bpm === undefined ? {} : { bpm }),
  }), [beat, key, bpm]);
  const result = useMemo(() => parseExtendedTextProgression(input, metadata), [input, metadata]);
  const scoreItems = useMemo(() => buildTextPreviewScore(result), [result]);
  const playbackSnapshot = useMemo(() => ({
    notes: extendedTextPlaybackNotes(result, metronome), lengthBeats: result.scoreLengthBeats,
    beatsPerBar: result.beatsPerBar, sourceText: input,
  }), [input, metronome, result]);
  const sourceMatches = transportState.snapshot?.sourceText === undefined
    || transportState.snapshot.sourceText === input;
  useTextScorePlayhead(previewRef, transport, transportState,
    result.beatsPerBar, result.bars.length, sourceMatches, language);
  const practiceStatus = useMemo(() => result.canConvert
    ? evaluateExtendedTextPractice(result, practiceBpm) : undefined, [result, practiceBpm]);
  const errors = result.diagnostics.filter(issue => issue.severity === "ERROR");
  const warnings = result.diagnostics.filter(issue => issue.severity === "WARNING");
  const annotationCount = result.sections.filter(section => section.kind === "comment"
    && !/^\s*#\s*(Key|BPM)\s*:/i.test(section.raw)).length;
  const lines = input.split(/\r\n|\r|\n/);
  const diagnosticLines = new Map<number, "ERROR" | "WARNING">();
  for (const issue of result.diagnostics) if (issue.severity !== "INFO") {
    if (issue.severity === "ERROR" || !diagnosticLines.has(issue.line)) {
      diagnosticLines.set(issue.line, issue.severity);
    }
  }
  const pendingClass = "rounded border border-[var(--lv-warning)] bg-[var(--lv-warning-soft)] px-3 py-2 text-sm text-[var(--lv-warning)]";
  const appliedClass = "lv-button-secondary px-3 py-2 text-sm";

  function auditionSpan(span: TextSourceRange) {
    const harmonic = result.harmonicSpans.find(item => item.sourceSpan.start === span.start
      || item.attacks.some(attack => attack.span.start === span.start));
    if (!harmonic || !sourceMatches) return;
    const attack = harmonic.attacks.find(item => item.span.start === span.start);
    transport.seek(attack?.beat ?? harmonic.startBeat);
    if (transportState.status === "playing") return;
    void controller.toggle({ kind: "capture", id: "extended-text-band:" + span.start },
      { type: "chord", chord: harmonic.chord, sound: selectedSound }).catch(error => {
      setPlayError(error instanceof Error ? error.message : String(error));
    });
  }

  function save() {
    if (disabled || !result.canConvert || !name.trim()) return;
    try {
      const success = onSave(result, name.trim());
      setSaveFailed(!success);
      setSaved(success);
    } catch {
      setSaveFailed(true);
      setSaved(false);
    }
  }

  function selectSource(span: TextSourceRange) {
    setSelectedStart(span.start);
    setVisiblePane("input");
    const editor = textareaRef.current;
    if (!editor) return;
    editor.focus();
    editor.setSelectionRange(span.start, span.end);
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
    <div data-testid="extended-text-intake" className="lv-text-intake-shell mt-4 overflow-hidden rounded-xl border border-[var(--lv-border)] bg-[var(--lv-surface)]">
      <div className="lv-text-intake-toolbar flex flex-wrap items-center gap-3 border-b border-[var(--lv-border)] p-3">
        <label className="flex items-center gap-2 text-sm">{label(language, "Meter", "拍子")}
          <select data-testid="extended-text-meter" value={beat} disabled={disabled}
            onChange={event => setBeat(event.target.value)}
            className="lv-field-control min-h-9 px-2">
            {Array.from({ length: 12 }, (_, index) => String(index + 1) + "/4").map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <BpmScrubField idPrefix="text-intake-bpm" label="BPM" disabled={disabled}
          dragLabel={label(language, "Drag up or down to change BPM", "上下にドラッグしてBPMを変更")}
          value={practiceBpm} onChange={value => {
            transport.setBpm(value); setPracticeBpm(value); setBpm(value);
          }} />
        <TextTransportBar language={language} transport={transport} state={transportState}
          snapshot={playbackSnapshot} disabled={disabled || (transportState.status === "stopped" && !result.canConvert)}
          sourceMatches={sourceMatches} primaryTestId="extended-text-play"
          frozenTestId="extended-text-frozen-playback" />
        {playError ? <span role="alert" className="text-xs text-[var(--lv-danger)]">{playError}</span> : null}
      </div>

      <div className="lv-text-intake-tabs border-b border-[var(--lv-border)] p-2" role="tablist"
        aria-label={label(language, "Text workspace", "テキスト作業領域")}>
        <button type="button" role="tab" aria-selected={visiblePane === "input"}
          className={visiblePane === "input" ? "lv-button-primary px-3 py-2" : "lv-button-secondary px-3 py-2"}
          onClick={() => setVisiblePane("input")}>{label(language, "Input", "入力")}</button>
        <button type="button" role="tab" aria-selected={visiblePane === "preview"}
          className={visiblePane === "preview" ? "lv-button-primary px-3 py-2" : "lv-button-secondary px-3 py-2"}
          onClick={() => setVisiblePane("preview")}>{label(language, "Preview", "プレビュー")}</button>
      </div>

      <div className="lv-text-intake-grid">
        <section className={"lv-text-intake-pane min-w-0 border-r border-[var(--lv-border)] p-3" + (visiblePane === "input" ? " lv-text-intake-pane-active" : "")}
          aria-label={label(language, "Source editor", "元テキストの入力")} data-testid="extended-text-editor">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="extended-text-input" className="text-sm font-semibold">{label(language, "Score text", "進行テキスト")}</label>
            <div className="flex flex-wrap gap-2">
              {hints.key ? <button type="button" className={key === hints.key ? appliedClass : pendingClass}
                disabled={disabled || key === hints.key} onClick={() => setKey(hints.key)}>
                {key === hints.key
                  ? label(language, "Key applied: " + hints.key, "キー " + hints.key + " 使用中")
                  : label(language, "Use Key: " + hints.key, "キー " + hints.key + "を使う")}
              </button> : null}
              {hints.bpm !== undefined ? <button type="button" className={bpm === hints.bpm ? appliedClass : pendingClass}
                disabled={disabled || bpm === hints.bpm}
                onClick={() => { if (hints.bpm !== undefined) {
                  transport.setBpm(hints.bpm); setBpm(hints.bpm); setPracticeBpm(hints.bpm);
                } }}>
                {bpm === hints.bpm
                  ? label(language, "BPM applied: " + hints.bpm, "BPM " + hints.bpm + " 使用中")
                  : label(language, "Use BPM " + hints.bpm, "BPM " + hints.bpm + "を使う")}
              </button> : null}
            </div>
          </div>
          <div className="lv-text-intake-editor relative flex min-h-64 overflow-hidden rounded border border-[var(--lv-border)] bg-[var(--lv-bg)]">
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
              aria-invalid={errors.length > 0}
              aria-describedby="extended-text-diagnostics"
              onScroll={event => { if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop; }}
              onSelect={event => selectPreviewAtCaret(event.currentTarget.selectionStart)}
              onClick={event => selectPreviewAtCaret(event.currentTarget.selectionStart)}
              onKeyUp={event => selectPreviewAtCaret(event.currentTarget.selectionStart)}
              onChange={event => { setSaveFailed(false); setSaved(false); onInput(event.currentTarget.value); }}
              className="lv-text-intake-textarea min-h-64 min-w-0 flex-1 resize-none overflow-auto bg-transparent p-2 font-mono text-sm outline-none" />
          </div>
          {(key || bpm !== undefined) ? <p className="mt-2 text-xs text-[var(--lv-text-muted)]" data-testid="extended-text-metadata">
            {key ? "Key: " + key : ""}{key && bpm !== undefined ? " · " : ""}{bpm !== undefined ? String(bpm) + " BPM" : ""}
          </p> : null}
        </section>
        <section ref={previewRef} aria-label={label(language, "Live preview", "入力中のプレビュー")}
          className={"lv-text-intake-pane min-w-0 p-3" + (visiblePane === "preview" ? " lv-text-intake-pane-active" : "")}
          data-testid="extended-text-preview">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{label(language, "Live preview", "プレビュー")}</h3>
            <span className="text-xs text-[var(--lv-text-muted)]">{result.bars.length} {label(language, "bars", "小節")}</span>
            <span className="rounded border border-[var(--lv-danger)] px-2 py-1 text-xs text-[var(--lv-danger)]">{label(language, "Errors", "エラー")} {errors.length}</span>
            <span className="rounded border border-[var(--lv-warning)] bg-[var(--lv-warning-soft)] px-2 py-1 text-xs text-[var(--lv-warning)]">{label(language, "Warnings", "注意")} {warnings.length}</span>
            <span className="rounded border border-[var(--lv-border)] px-2 py-1 text-xs">{label(language, "Practice limits", "練習制限")} {practiceStatus?.ready === false ? 1 : 0}</span>
          </div>
          {practiceStatus?.ready === false ? <p data-testid="extended-text-practice-limit"
            className="mb-2 text-sm text-[var(--lv-warning)]">
            {label(language, "Save is available; Voicing Loop cannot use this exact timing: ",
              "保存できますが、Voicing Loopではこのタイミングを練習できません: ")}{practiceStatus.reason}
          </p> : null}
          {result.state === "EMPTY" ? <p className="text-sm text-[var(--lv-text-muted)]">{label(language, "Enter a progression to preview it.", "進行を入力するとここに表示されます。")}</p> : null}
          {scoreItems.map((item, index) => item.kind === "annotation"
            ? <button type="button" key={index} data-testid="extended-text-section"
                data-source-start={item.sourceSpan.start}
                className="mt-3 block w-full border-l-2 border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] p-2 text-left text-xs"
                onClick={() => selectSource(item.sourceSpan)}>{item.text}</button>
            : <div key={index} className="lv-text-intake-bars mt-2" data-testid="text-preview-row">
                {item.bars.map(bar => <TextPreviewBar key={bar.number} bar={bar} language={language}
                  selectedStart={selectedStart} onSelect={selectSource} onAudition={auditionSpan}
                  onBarSelect={span => { selectSource(span); if (sourceMatches) {
                    transport.seek((bar.number - 1) * result.beatsPerBar);
                  } }}
                  errorLabel={bar.error ? label(language, bar.error, japaneseDiagnostic[bar.error]) : undefined} />)}
              </div>)}
          {errors[0] ? <button type="button" className="lv-button-secondary mt-2 px-2 py-1 text-xs"
            onClick={() => selectSource(errors[0]!.span)}>
            {label(language, "Go to first error", "最初のエラーへ")}
          </button> : null}
          <div id="extended-text-diagnostics" role="status" aria-live="polite" className="mt-3"
            data-testid="extended-text-diagnostics">
            {result.diagnostics.map((diagnostic, index) => <p key={String(diagnostic.span.start) + ":" + String(index)}
              className={"mt-1 text-sm " + (diagnostic.severity === "ERROR" ? "text-[var(--lv-danger)]" : "text-[var(--lv-warning)]")}
              data-reason={diagnostic.reasonCode} data-span-start={diagnostic.span.start}
              data-span-end={diagnostic.span.end}>
              {diagnostic.severity} {diagnostic.line}:{diagnostic.column} [{diagnostic.span.start}-{diagnostic.span.end}] · {language === "ja" ? japaneseDiagnostic[diagnostic.reasonCode] : diagnostic.message}
            </p>)}
          </div>
        </section>
      </div>

      <div className="lv-text-intake-savebar sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-[var(--lv-border)] bg-[var(--lv-surface)] p-3">
        <label className="text-xs">{label(language, "Name", "名前")}
          <input value={name} maxLength={80} onChange={event => setName(event.target.value)}
            className="lv-field-control ml-2 min-h-9 w-44 px-2" data-testid="extended-text-name" />
        </label>
        <span className="min-w-0 flex-1 text-xs text-[var(--lv-text-muted)]">
          {result.bars.length} {label(language, "bars", "小節")} · {annotationCount} {label(language, "annotations", "注記")}
          {" · " + beat + " · " + String(practiceBpm) + " BPM"}
          {" · " + label(language, "Errors", "エラー") + " " + String(errors.length)}
          {" / " + label(language, "Warnings", "注意") + " " + String(warnings.length)}
          {" / " + label(language, "Practice limits", "練習制限") + " " + String(practiceStatus?.ready === false ? 1 : 0)}
        </span>
        <button type="button" data-testid="extended-text-save" className="lv-button-primary min-h-9 px-4 text-sm"
          disabled={disabled || !result.canConvert || !name.trim()} onClick={save}>
          {label(language, "Save to Vault", "Vaultに保存")}
        </button>
        {saved ? <span role="status" className="text-sm text-[var(--lv-accent)]">{label(language, "Saved", "保存しました")}</span> : null}
        {saveFailed ? <span role="alert" className="text-sm text-[var(--lv-warning)]">
          {label(language, "Save failed. Your text is still here.", "保存できませんでした。入力内容は保持されています。")}
        </span> : null}
      </div>
    </div>
  );
}
