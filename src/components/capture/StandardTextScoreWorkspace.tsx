import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TextTransport, TextTransportState } from "../../audio/textTransport";
import type { AppLanguage } from "../../i18n";
import type { TextProgressionEvent, TextProgressionParseResult } from "../../domain/textProgression";
import type { TextSourceRange } from "../../domain/extendedTextProgression";
import { buildStandardTextPreviewScore } from "../../domain/standardTextPreviewScore";
import { TextPreviewBar } from "./TextPreviewBar";
import { useTextScorePlayhead } from "./useTextScorePlayhead";
import { TextCapturePreviewStatus } from "./TextCapturePreviewStatus";
import type { TextCaptureStatusModel } from "./textCaptureStatus";

interface Props {
  readonly language: AppLanguage;
  readonly input: string;
  readonly editorSelection: { readonly start: number; readonly end: number };
  readonly onEditorSelection: (start: number, end: number) => void;
  readonly result: TextProgressionParseResult;
  readonly statusModel: TextCaptureStatusModel;
  readonly disabled: boolean;
  readonly onInput: (value: string) => void;
  readonly onSelectEvent: (event: TextProgressionEvent) => void;
  readonly onSeekBar: (bar: number) => void;
  readonly transport: TextTransport;
  readonly transportState: TextTransportState;
}

/** Standard syntax retains its parser but shares the score workspace primitives. */
export function StandardTextScoreWorkspace({ language, input, result, disabled, onInput, onSelectEvent,
  onSeekBar, transport, transportState, editorSelection, onEditorSelection, statusModel }: Props) {
  const [visiblePane, setVisiblePane] = useState<"input" | "preview">("input");
  const [selectedStart, setSelectedStart] = useState<number>();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { textareaRef.current?.setSelectionRange(editorSelection.start, editorSelection.end); }, []);
  const previewRef = useRef<HTMLElement>(null);
  const scoreItems = useMemo(() => buildStandardTextPreviewScore(result), [result]);
  const lines = input.split(/\r\n|\r|\n/);
  const ja = language === "ja";
  useTextScorePlayhead(previewRef, transport, transportState, 4, result.bars,
    transportState.snapshot?.sourceText === undefined || transportState.snapshot.sourceText === input, language);

  function selectSource(span: TextSourceRange, audition: boolean) {
    setSelectedStart(span.start);
    const event = result.events.find(item => item.range.start === span.start && item.range.end === span.end);
    if (audition && event && (transportState.status === "stopped" || transportState.snapshot?.sourceText === input)) onSelectEvent(event);
    if (visiblePane !== "input") setVisiblePane("input");
    const editor = textareaRef.current;
    if (!editor) return;
    editor.focus();
    editor.setSelectionRange(span.start, span.end);
    onEditorSelection(span.start, span.end);
    const line = input.slice(0, span.start).split(/\r\n|\r|\n/).length - 1;
    editor.scrollTop = Math.max(0, line * 24 - editor.clientHeight / 3);
  }

  function selectPreviewAtCaret(position: number) {
    const event = result.events.find(item => position >= item.range.start && position < item.range.end);
    if (!event) return;
    setSelectedStart(event.range.start);
    previewRef.current?.querySelector<HTMLElement>(`[data-source-start="${event.range.start}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }

  return <div className="lv-text-intake-workspace"
    data-testid="standard-text-workspace">
    <div className="lv-text-intake-tabs border-b border-[var(--lv-border)] p-2" role="tablist"
      aria-label={ja ? "テキスト作業領域" : "Text workspace"}>
      <button type="button" role="tab" aria-selected={visiblePane === "input"}
        className={visiblePane === "input" ? "lv-button-primary px-3 py-2" : "lv-button-secondary px-3 py-2"}
        onClick={() => setVisiblePane("input")}>{ja ? "入力" : "Input"}</button>
      <button type="button" role="tab" aria-selected={visiblePane === "preview"}
        className={visiblePane === "preview" ? "lv-button-primary px-3 py-2" : "lv-button-secondary px-3 py-2"}
        onClick={() => setVisiblePane("preview")}>{ja ? "プレビュー" : "Preview"}</button>
    </div>
    <div className="lv-text-intake-grid">
      <section className={"lv-text-intake-pane min-w-0 border-r border-[var(--lv-border)] p-3" +
        (visiblePane === "input" ? " lv-text-intake-pane-active" : "")}
        aria-label={ja ? "元テキストの入力" : "Source editor"}>
        <label className="mb-3 block text-sm font-semibold" htmlFor="text-progression-input">
          {ja ? "進行テキスト" : "Score text"}
        </label>
        <div className="lv-text-intake-editor relative flex overflow-hidden bg-[var(--lv-surface)]">
          <div aria-hidden="true" className="lv-text-intake-gutter shrink-0 overflow-hidden border-r border-[var(--lv-border)] text-right font-mono text-xs text-[var(--lv-text-muted)]">
            {lines.map((_line, index) => <div key={index}>{index + 1}</div>)}
          </div>
          <textarea id="text-progression-input" data-testid="text-progression-input" ref={textareaRef}
            value={input} disabled={disabled} spellCheck={false}
            aria-invalid={Boolean(input.trim()) && result.diagnostics.length > 0}
            aria-describedby={result.diagnostics.length ? "text-progression-format text-progression-diagnostics" : "text-progression-format"}
            {...(result.diagnostics.length ? { "aria-errormessage": "text-progression-diagnostics" } : {})}
            onSelect={event => { onEditorSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
              selectPreviewAtCaret(event.currentTarget.selectionStart); }}
            onClick={event => selectPreviewAtCaret(event.currentTarget.selectionStart)}
            onChange={event => onInput(event.currentTarget.value)}
            className="lv-text-intake-textarea min-w-0 flex-1 resize-none overflow-auto bg-transparent p-2 font-mono text-sm outline-none" />
        </div>
      </section>
      <section ref={previewRef} aria-label={ja ? "入力中のプレビュー" : "Live preview"}
        className={"lv-text-intake-pane min-w-0 p-3" + (visiblePane === "preview" ? " lv-text-intake-pane-active" : "")}
        data-testid="standard-text-preview">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{ja ? "プレビュー" : "Preview"}</h3>
          <span className="text-xs text-[var(--lv-text-muted)]">{result.bars} {ja ? "小節" : "bars"}</span>
          <TextCapturePreviewStatus model={statusModel} language={language} />
        </div>
        <div className="lv-text-preview-scroll" data-testid="standard-text-preview-scroll">
        {scoreItems.map((item, row) => item.kind === "row" ?
          <div key={row} className="lv-text-intake-bars mt-2" data-testid="text-preview-row">
            {item.bars.map(bar => <TextPreviewBar key={bar.number} bar={bar} language={language}
              selectedStart={selectedStart}
              onSelect={span => selectSource(span, true)}
              onBarSelect={span => { selectSource(span, false); if (transportState.status === "stopped"
                || transportState.snapshot?.sourceText === input) onSeekBar(bar.number); }}
              errorLabel={result.diagnostics.find(issue => issue.bar === bar.number)?.message} />)}
          </div> : null)}
        {!scoreItems.length ? <p className="grid min-h-64 place-items-center text-center text-sm text-[var(--lv-text-muted)]">
          {ja ? "コード進行を入力すると、ここに譜面が表示されます" : "Enter a progression to see the score here."}</p> : null}
        </div>
      </section>
    </div>
  </div>;
}
