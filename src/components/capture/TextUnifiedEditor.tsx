import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { mergeNormalizeChanges, type NormalizeResult } from "../../domain/textNormalize";
import type { UnifiedDiagnostic, UnifiedTextResult } from "../../domain/textUnified";

/**
 * P24-05 05-b: the one input's editor.
 *
 * The real control stays a plain textarea, so typing, IME, selection and Ctrl+Z keep working exactly as
 * before. Two layers repeat the same text with the same metrics around it:
 * - under the textarea: the row numbers, the 3px row bars, the error row background and the ring of the
 *   chosen card (all behind the caret, so the caret is never hidden);
 * - over the textarea: the coloured text, the dotted/wavy underlines, the row tags, and the few small
 *   buttons. Only the buttons and the marked characters take the pointer; everything else lets the click
 *   through to the textarea, so clicking anywhere still puts the caret exactly where the person clicked.
 */
export const TEXT_EDITOR_LINE_HEIGHT = 28;
const FONT_SIZE = 13;
const PAD_TOP = 8;
const PAD_BOTTOM = 8;
const PAD_RIGHT = 10;
const GUTTER_WIDTH = 40;
const BAR_WIDTH = 3;
const GAP = 8;
const TEXT_LEFT = GUTTER_WIDTH + GAP + BAR_WIDTH + GAP;

/** The design's row colours: code, skipped (lyrics), heading, error. */
const ROW_COLOR = { code: "#42d8c6", skipped: "#3a4a60", heading: "#4a4290", error: "#ee6b73" } as const;

interface Props {
  readonly input: string;
  readonly disabled: boolean;
  readonly placeholder: string;
  readonly normalized: NormalizeResult;
  readonly diagnostics: readonly UnifiedDiagnostic[];
  readonly slots: UnifiedTextResult["slots"];
  /** The chosen card's characters in the typed text, if a card is chosen. */
  readonly selectedRange?: { readonly start: number; readonly end: number };
  /** Lines the person hid with 「読み飛ばした行を隠す」. */
  readonly hiddenLines: ReadonlySet<number>;
  readonly onInput: (value: string) => void;
  readonly onSelectToken: (span: { readonly start: number; readonly end: number }) => void;
  readonly onSelection: (start: number, end: number) => void;
  readonly onReadAsCode: (line: string) => void;
  readonly onScroll?: () => void;
  /** P24-fix-1: while 「鍵盤で入れる」 is on, the empty screen's guidance stays out of the way. */
  readonly suppressEmptyFace?: boolean;
  readonly ariaDescribedBy?: string;
  readonly invalid: boolean;
  readonly editorRef?: { current: HTMLTextAreaElement | null };
}

interface Mark {
  readonly start: number;
  readonly end: number;
  readonly kind: "token" | "error" | "change";
  readonly title?: string;
  readonly span: { readonly start: number; readonly end: number };
}

export function TextUnifiedEditor({
  input, disabled, placeholder, normalized, diagnostics, slots, selectedRange, hiddenLines,
  onInput, onSelectToken, onSelection, onReadAsCode, onScroll, ariaDescribedBy, invalid, editorRef,
  suppressEmptyFace = false,
}: Props) {
  const localRef = useRef<{ current: HTMLTextAreaElement | null }>({ current: null });
  const ref = editorRef ?? localRef.current;
  const underInner = useRef<HTMLDivElement>(null);
  const overInner = useRef<HTMLDivElement>(null);
  const [hoveredLine, setHoveredLine] = useState<number>();
  const lines = input.split("\n");
  const lineStarts = normalized.lineRawStarts;
  const lineOf = (offset: number): number => {
    let found = 0;
    for (let index = 0; index < lineStarts.length; index += 1) {
      if ((lineStarts[index] ?? 0) <= offset) found = index;
      else break;
    }
    return found;
  };
  const errorLines = new Set<number>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === "ERROR") errorLines.add(lineOf(diagnostic.rawSpan.start) + 1);
  }
  // The tag zone is drawn for lines that carry one; the editor's own text never reaches it in practice.
  const rowKindOf = (lineNumber: number): "code" | "skipped" | "heading" | "comment" | "blank" => {
    const entry = normalized.lines[lineNumber - 1];
    return entry?.kind ?? "blank";
  };

  function syncScroll(element: HTMLTextAreaElement) {
    const top = element.scrollTop;
    for (const layer of [underInner.current, overInner.current]) {
      if (layer) layer.style.transform = `translateY(${-top}px)`;
    }
    onScroll?.();
  }

  function runMark(mark: Mark) {
    const editor = ref.current;
    if (!editor) return;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(mark.span.start, mark.span.end);
    onSelection(mark.span.start, mark.span.end);
    if (mark.kind === "token") onSelectToken(mark.span);
  }

  function renderRow(lineNumber: number, layer: "under" | "over"): ReactNode {
    const raw = lines[lineNumber - 1] ?? "";
    const kind = rowKindOf(lineNumber);
    const hidden = hiddenLines.has(lineNumber);
    const isError = errorLines.has(lineNumber);
    const numberColor = isError ? "#ffb3b8" : "#7f90aa";
    const bar = isError ? ROW_COLOR.error
      : kind === "skipped" ? ROW_COLOR.skipped
        : kind === "heading" ? ROW_COLOR.heading
          : kind === "code" ? ROW_COLOR.code : "transparent";
    const textColor = isError ? "#ffb3b8"
      : kind === "heading" ? "#c9b7ff"
        : kind === "skipped" ? "#7f90aa" : "#f2f6fc";
    const marks = marksOfLine(lineNumber, raw);
    return (
      <div key={lineNumber} data-line={lineNumber} data-line-kind={kind}
        style={{
          display: "flex", alignItems: "center", gap: GAP, minHeight: TEXT_EDITOR_LINE_HEIGHT,
          background: isError ? "#1d1520" : undefined, marginRight: -PAD_RIGHT, paddingRight: PAD_RIGHT,
        }}>
        <span style={{
          flex: "none", width: GUTTER_WIDTH, textAlign: "right", fontSize: 11,
          color: numberColor, fontFamily: "var(--font-mono)",
        }}>{lineNumber}</span>
        <span aria-hidden="true" style={{ flex: "none", width: BAR_WIDTH, height: 18, borderRadius: 2, background: bar }} />
        <span style={{
          minWidth: 0, flex: 1, whiteSpace: "pre", overflow: "hidden",
          color: layer === "under" ? "transparent" : textColor,
          fontWeight: kind === "heading" ? 700 : undefined,
        }}>
          {hidden ? "" : layer === "under"
            ? <UnderMarks raw={raw} marks={marks} selectedRange={selectedRange} />
            : <OverMarks raw={raw} marks={marks} onRun={runMark} />}
        </span>
        {layer === "over" && !hidden ? <RowTag kind={kind} /> : null}
        {layer === "over" && kind === "skipped" && hoveredLine === lineNumber && !hidden
          ? <button type="button" data-testid="text-read-as-code" style={READ_AS_CODE_STYLE}
            onMouseDown={(event) => { event.preventDefault(); onReadAsCode(raw); }}>{"コードとして読む"}</button>
          : null}
      </div>
    );
  }

  function marksOfLine(lineNumber: number, raw: string): Mark[] {
    const start = lineStarts[lineNumber - 1] ?? 0;
    const marks: Mark[] = [];
    for (const slot of slots) {
      if (slot.kind !== "attack" && slot.kind !== "reattack") continue;
      if (slot.span.start < start || slot.span.start >= start + raw.length) continue;
      marks.push({ start: slot.span.start - start, end: slot.span.end - start, kind: "token", span: slot.span });
    }
    for (const diagnostic of diagnostics) {
      if (diagnostic.severity !== "ERROR") continue;
      if (diagnostic.rawSpan.start < start || diagnostic.rawSpan.start >= start + raw.length) continue;
      marks.push({
        start: diagnostic.rawSpan.start - start, end: Math.min(raw.length, diagnostic.rawSpan.end - start),
        kind: "error", title: diagnostic.message, span: diagnostic.rawSpan,
      });
    }
    for (const change of mergeNormalizeChanges(normalized.changes)) {
      if (change.line !== lineNumber) continue;
      // fix-2 item 3: a tidied chord/bar line reads as one mark (one dotted underline), not one per character.
      if (change.from.trim() === "" && change.to.trim() === "") continue;
      marks.push({
        start: change.start, end: change.end, kind: "change",
        title: `読むときは ${change.to}`, span: { start: start + change.start, end: start + change.end },
      });
    }
    return marks.sort((left, right) => left.start - right.start || left.end - right.end);
  }

  return (
    <div className="lv-text-editor-frame lv-text-intake-editor relative min-h-0 flex-1" data-testid="text-intake-editor"
      onMouseMove={(event) => {
        const editor = ref.current;
        if (!editor) return;
        const box = event.currentTarget.getBoundingClientRect();
        const y = event.clientY - box.top + editor.scrollTop - PAD_TOP;
        const line = Math.max(1, Math.min(lines.length, Math.floor(y / TEXT_EDITOR_LINE_HEIGHT) + 1));
        if (line !== hoveredLine) setHoveredLine(line);
      }}
      onMouseLeave={() => setHoveredLine(undefined)}>
      <div aria-hidden="true" className="lv-text-editor-layer" data-testid="text-intake-decorations"
        data-layer="under" style={{ ...LAYER_STYLE, zIndex: 0 }}>
        <div ref={underInner} style={{ paddingTop: PAD_TOP, willChange: "transform" }}>
          {lines.map((_line, index) => renderRow(index + 1, "under"))}
        </div>
      </div>
      <textarea ref={(node) => { localRef.current.current = node; if (editorRef !== undefined) editorRef.current = node; }}
        id="text-progression-input" data-testid="text-progression-input"
        value={input} disabled={disabled} spellCheck={false} placeholder={placeholder}
        aria-label="進行テキスト" aria-invalid={invalid} {...(ariaDescribedBy === undefined ? {} : { "aria-describedby": ariaDescribedBy })}
        {...(invalid ? { "aria-errormessage": "text-progression-diagnostics" } : {})}
        onScroll={(event) => syncScroll(event.currentTarget)}
        onSelect={(event) => onSelection(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)}
        onChange={(event) => onInput(event.currentTarget.value)}
        style={{
          position: "absolute", inset: 0, zIndex: 1, width: "100%", height: "100%", resize: "none",
          padding: `${PAD_TOP}px ${PAD_RIGHT}px ${PAD_BOTTOM}px ${TEXT_LEFT}px`,
          border: 0, outline: "none", background: "transparent", color: "transparent", caretColor: "#f2f6fc",
          fontFamily: "var(--font-mono)", fontSize: FONT_SIZE, lineHeight: `${TEXT_EDITOR_LINE_HEIGHT}px`,
          whiteSpace: "pre", overflow: "auto", tabSize: 2,
        }} />
      <div className="lv-text-editor-layer" data-layer="over" data-testid="text-intake-marks"
        style={{ ...LAYER_STYLE, zIndex: 2 }}>
        <div ref={overInner} style={{ paddingTop: PAD_TOP, willChange: "transform" }}>
          {lines.map((_line, index) => renderRow(index + 1, "over"))}
        </div>
      </div>
      {input.trim() === "" && !suppressEmptyFace ? <EmptyFace /> : null}
    </div>
  );
}

const LAYER_STYLE: CSSProperties = {
  position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none",
  fontFamily: "var(--font-mono)", fontSize: FONT_SIZE, lineHeight: `${TEXT_EDITOR_LINE_HEIGHT}px`,
};

const READ_AS_CODE_STYLE: CSSProperties = {
  flex: "none", height: 22, padding: "0 8px", border: "1px solid rgb(150 170 195 / 28%)", borderRadius: 6,
  background: "#111b2a", color: "#a5b2c6", fontFamily: "var(--font-sans)", fontSize: 11, whiteSpace: "nowrap",
  pointerEvents: "auto",
};

function RowTag({ kind }: { readonly kind: string }) {
  if (kind === "skipped") {
    return <span style={TAG_STYLE("rgb(150 170 195 / 28%)", "#a5b2c6")}>{"歌詞"}</span>;
  }
  if (kind === "heading") {
    return <span style={TAG_STYLE("#4a4290", "#c9b7ff")}>{"見出し"}</span>;
  }
  return null;
}

const TAG_STYLE = (border: string, color: string): CSSProperties => ({
  flex: "none", padding: "0 6px", border: `1px solid ${border}`, borderRadius: 6,
  fontFamily: "var(--font-sans)", fontSize: 11, lineHeight: "18px", color,
});

/** The ring of the chosen card; it lives under the caret so typing never loses the caret. */
function UnderMarks({ raw, marks, selectedRange }: {
  readonly raw: string;
  readonly marks: readonly Mark[];
  readonly selectedRange?: { readonly start: number; readonly end: number };
}) {
  if (marks.length === 0) return <span style={{ whiteSpace: "pre" }}>{raw}</span>;
  const segments = segment(raw.length, marks);
  return <>
    {segments.map((segment, index) => {
      const tokens = marks.filter((mark) => mark.kind === "token"
        && mark.start < segment.end && mark.end > segment.start);
      const selected = selectedRange !== undefined && tokens.some((mark) => mark.span.start >= selectedRange.start
        && mark.span.end <= selectedRange.end);
      return <span key={index} data-selected-token={selected ? "true" : undefined} style={{
        whiteSpace: "pre",
        ...(selected ? { background: "#123b3a", boxShadow: "0 0 0 1px #42d8c6", borderRadius: 5 } : {}),
      }}>{raw.slice(segment.start, segment.end)}</span>;
    })}
  </>;
}

function OverMarks({ raw, marks, onRun }: {
  readonly raw: string;
  readonly marks: readonly Mark[];
  readonly onRun: (mark: Mark) => void;
}) {
  if (marks.length === 0) return <span style={{ pointerEvents: "none" }}>{raw}</span>;
  const segments = segment(raw.length, marks);
  return <>
    {segments.map((segment, index) => {
      const inside = marks.filter((mark) => mark.start < segment.end && mark.end > segment.start);
      const error = inside.find((mark) => mark.kind === "error");
      const change = inside.find((mark) => mark.kind === "change");
      const token = inside.find((mark) => mark.kind === "token");
      if (inside.length === 0) return <span key={index} style={{ whiteSpace: "pre" }}>{raw.slice(segment.start, segment.end)}</span>;
      // A normalised chord keeps the card's click: the token wins, the dotted mark stays on it.
      const run = token ?? error ?? change!;
      const decorations = [
        ...(error ? [`underline wavy #ee6b73`] : []),
        ...(change ? [`underline dotted #78c8f5`] : []),
      ];
      const title = run.title ?? error?.title ?? change?.title;
      return <span key={index} data-mark={run.kind} data-span-start={run.span.start}
        data-token={token === undefined ? undefined : "true"}
        data-changed={change === undefined ? undefined : "true"}
        title={title} style={{
        whiteSpace: "pre", cursor: "pointer", pointerEvents: "auto",
        ...(decorations.length ? { textDecoration: decorations.join(", "), textUnderlineOffset: 4 } : {}),
      }} onMouseDown={(event) => { event.preventDefault(); onRun(run); }}>{raw.slice(segment.start, segment.end)}</span>;
    })}
  </>;
}

/** Splits a line at every mark boundary; each segment carries exactly one state. */
function segment(length: number, marks: readonly Mark[]): Array<{ start: number; end: number }> {
  const points = new Set<number>([0, length]);
  for (const mark of marks) {
    points.add(Math.max(0, Math.min(length, mark.start)));
    points.add(Math.max(0, Math.min(length, mark.end)));
  }
  const sorted = [...points].sort((left, right) => left - right);
  const out: Array<{ start: number; end: number }> = [];
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index]!;
    const end = sorted[index + 1]!;
    if (end > start) out.push({ start, end });
  }
  return out;
}

/** The empty input's face: the drawing, the two lines. No button (the design has none). */
function EmptyFace() {
  return <div aria-hidden="true" style={{
    position: "absolute", inset: 0, zIndex: 3, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 18, paddingBottom: 40, pointerEvents: "none",
  }}>
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="#42d8c6" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="8" width="26" height="30" rx="4" />
      <path d="M16 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
      <path d="M15 18h14M15 24h14M15 30h8" />
    </svg>
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#f2f6fc" }}>{"書く、または貼り付ける"}</p>
      <p style={{ margin: 0, fontSize: 12, color: "#a5b2c6", textAlign: "center" }}>
        {"コード譜をそのまま貼っても読めます。歌詞の行は自動で読み飛ばします。"}
      </p>
    </div>
  </div>;
}
