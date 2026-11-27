import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TextTransport, TextTransportState } from "../../audio/textTransport";
import type { TextProgressionEvent, TextProgressionParseResult } from "../../domain/textProgression";
import type { UnifiedDiagnostic, UnifiedTextResult } from "../../domain/textUnified";
import { useTextScorePlayhead } from "./useTextScorePlayhead";
import { TextUnifiedEditor } from "./TextUnifiedEditor";
import { buildUnifiedPreview, type UnifiedPreviewBar, type UnifiedPreviewCard } from "./textUnifiedView";
import type { PreviewHarmony } from "./TextPreviewBar";

import { displayKey } from "../../domain/displayLabels";
import { displayChordLabel, splitChordLabel } from "../../ui/chordText";
import { STANDARD_TEXT_PLACEHOLDER } from "./textIntakeExamples";

/** P23-17 V4/C10: the example in the empty input; it must read with no errors. */
export { STANDARD_TEXT_PLACEHOLDER };

export interface TextIntakeHints {
  readonly key?: string;
  readonly bpm?: number;
}

interface Props {
  readonly input: string;
  readonly result: TextProgressionParseResult;
  readonly unified: UnifiedTextResult;
  readonly disabled: boolean;
  readonly editorSelection: { readonly start: number; readonly end: number };
  readonly editorRef?: { current: HTMLTextAreaElement | null };
  readonly onEditorSelection: (start: number, end: number) => void;
  readonly onInput: (value: string) => void;
  readonly onSelectEvent: (event: TextProgressionEvent, beat?: number, cardStart?: number) => void;
  /** P24-07 item 3: the Delete/Backspace card (pointer over it) and its small menu. */
  readonly onCardHover?: (start?: number) => void;
  readonly onCardMenu?: (start: number, x: number, y: number) => void;
  readonly onSeekBar: (bar: number) => void;
  readonly transport: TextTransport;
  readonly transportState: TextTransportState;
  readonly harmonyFor?: (sourceStart: number, beat?: number) => PreviewHarmony | undefined;
  readonly selectedSourceStart?: number;
  /** P25-03 C1: the card the band shows (its own characters); no card is chosen when undefined. */
  readonly selectedCardStart?: number;
  /** P25-03: any card that is pressed, rests included. */
  readonly onSelectCardStart?: (start: number) => void;
  /** `# Key:` / `# BPM:` lines: the proposals the person can apply, and what is applied now. */
  readonly hints: TextIntakeHints;
  readonly appliedKey?: string;
  readonly appliedBpm?: number;
  readonly onApplyKey: (key: string) => void;
  readonly onApplyBpm: (bpm: number) => void;
  readonly onReadAsCode: (line: string) => void;
  /** Lines the person chose to hide (only their text is hidden; the line keeps its place). */
  readonly hiddenLines: ReadonlySet<number>;
  readonly onMoveDiagnostic: (diagnostic: UnifiedDiagnostic) => void;
  readonly onFixDiagnostic: (diagnostic: UnifiedDiagnostic, replacement: string) => void;
  readonly fixOf: (diagnostic: UnifiedDiagnostic) => string | undefined;
  readonly locationOf: (diagnostic: UnifiedDiagnostic) => string;
  /** P24-06: 「鍵盤で入れる」 — the toggle, its band, the open bar and the held chord. */
  readonly keyboardOn?: boolean;
  readonly onToggleKeyboard?: () => void;
  readonly keyboardBand?: ReactNode;
  readonly pendingText?: string;
  readonly pendingCards?: readonly PendingPreviewCard[];
  readonly selectedPendingIndex?: number;
  readonly onSelectPending?: (index: number) => void;
  /** P25 V23: the dotted 「＋」 after the last bar and the palette's open pending bar (V24-6: one cell). */
  readonly suggestion?: {
    readonly number: number;
    readonly open: boolean;
    readonly beatsPerBar: number;
    readonly pending: readonly { readonly label: string; readonly beats: number; readonly rest?: boolean }[];
    readonly selectedPending?: number;
    readonly onSelectPending?: (index: number) => void;
    readonly onOpen: (rect: DOMRect) => void;
    readonly onContextMenu: (event: React.MouseEvent) => void;
  };
  readonly heldCard?: HeldPreviewCard;
  /** P24-06: bumped when a chord is added; the two panes follow the latest unless the person scrolled away. */
  readonly followTick?: number;
}

export interface PendingPreviewCard {
  readonly label: string;
  readonly role?: string;
  /** An added rest (`_`): shown as the rest face, not a chord. */
  readonly rest?: boolean;
  /** P24-fix-1: how the sound was made (the keyboard's cards say 「弾いた音」). */
  readonly voicing?: string;
}

export interface HeldPreviewCard {
  readonly label: string;
  readonly degree?: string;
  readonly role?: string;
}

/**
 * P24-05 05-b: the one screen's working area, in the P23-17 shape the design keeps
 * (two top groups, the input on the left, one card face per bar on the right, the chosen card's row below).
 */
export function TextUnifiedWorkspace({
  input, result, unified, disabled, editorSelection, editorRef, onEditorSelection,
  onInput, onSelectEvent, onSeekBar, transport, transportState, harmonyFor, selectedSourceStart, selectedCardStart, onSelectCardStart, onCardHover, onCardMenu,
  hints, appliedKey, appliedBpm, onApplyKey, onApplyBpm, onReadAsCode, hiddenLines,
  onMoveDiagnostic, onFixDiagnostic, fixOf, locationOf,
  keyboardOn = false, onToggleKeyboard, keyboardBand, pendingText, pendingCards = [], selectedPendingIndex,
  onSelectPending, heldCard, followTick = 0, suggestion,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editor = editorRef ?? textareaRef;
  /** Under 899px only one pane fits; the two tabs are the old P23-17 way of choosing it. */
  const [visiblePane, setVisiblePane] = useState<"input" | "preview">("input");
  /** P24-06: whether each pane is being read away from its end (then adding does not move it). */
  const [editorAway, setEditorAway] = useState(false);
  const [previewAway, setPreviewAway] = useState(false);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const bottomOf = (element: HTMLElement | null) => element === null
    ? false : element.scrollTop + element.clientHeight < element.scrollHeight - 8;
  useEffect(() => {
    if (followTick === 0) return;
    const editorNode = editor.current;
    if (!editorAway && editorNode !== null) {
      editorNode.scrollTop = editorNode.scrollHeight;
      editorNode.dispatchEvent(new Event("scroll"));
    }
    if (!previewAway && previewScrollRef.current !== null) previewScrollRef.current.scrollTop = previewScrollRef.current.scrollHeight;
  }, [followTick, editorAway, previewAway, editor]);
  useLayoutEffect(() => { editor.current?.setSelectionRange(editorSelection.start, editorSelection.end); }, []);
  const previewRef = useRef<HTMLElement>(null);
  const previewItems = useMemo(() => buildUnifiedPreview(unified), [unified]);
  /** P25 V23: the dotted ＋ belongs to the very last group only (a chart can have several headings). */
  const lastGroupIndex = previewItems.reduce((last, item, index) => item.kind === "group" ? index : last, -1);
  const errors = unified.diagnostics.filter((diagnostic) => diagnostic.severity === "ERROR");
  const skipped = unified.normalized.skipped;
  const changes = unified.normalized.changes;
  const readableBars = previewItems.reduce((total, item) => item.kind === "group"
    ? total + item.group.bars.filter((bar) => bar.readable).length : total, 0);
  const codeCount = previewItems.reduce((total, item) => item.kind === "group"
    ? total + item.group.bars.reduce((sum, bar) => sum + bar.cards.filter((card) => !card.rest && card.error === undefined).length, 0)
    : total, 0);
  const sourceMatches = transportState.snapshot?.sourceText === undefined || transportState.snapshot.sourceText === input;
  useTextScorePlayhead(previewRef, transport, transportState, unified.beatsPerBar, unified.bars.length, sourceMatches);

  /** The characters of the card the person chose (the ring in the input and the card's own face). */
  const [selectedToken, setSelectedToken] = useState<{ readonly start: number; readonly end: number }>();

  function selectSource(span: { start: number; end: number }, audition: boolean, cardStart?: number) {
    const editorNode = editor.current;
    if (editorNode) {
      editorNode.focus({ preventScroll: true });
      editorNode.setSelectionRange(span.start, span.end);
      onEditorSelection(span.start, span.end);
      const line = input.slice(0, span.start).split(/\r\n|\r|\n/).length - 1;
      editorNode.scrollTop = Math.max(0, line * 28 - editorNode.clientHeight / 3);
      editorNode.dispatchEvent(new Event("scroll"));
    }
    const event = result.events.find((item) => item.range.start === span.start)
      ?? result.events.find((item) => span.start >= item.range.start && span.start < item.range.end);
    if (event === undefined) return;
    onSelectEvent(event, beatAt(span.start), cardStart);
    if (audition && !sourceMatches) return;
  }

  function selectToken(span: { start: number; end: number }) {
    onSelectCardStart?.(span.start);
    setSelectedToken({ start: span.start, end: span.end });
    selectSource(span, true, span.start);
  }

  /** P24-fix-1: the beat of the card at a typed position (for the attack's own sound). */
  function beatAt(start: number): number | undefined {
    const slot = unified.slots.find((item) => item.span.start === start);
    return slot === undefined ? undefined : (slot.bar - 1) * unified.beatsPerBar + (slot.startBeat - 1);
  }

  function selectCard(card: UnifiedPreviewCard) {
    onSelectCardStart?.(card.span.start);
    setSelectedToken({ start: card.span.start, end: card.span.end });
    selectSource(card.span, true, card.span.start);
  }

  const selectedRange = selectedToken ?? (selectedSourceStart === undefined ? undefined
    : (() => {
        const event = result.events.find((item) => item.range.start === selectedSourceStart);
        return event === undefined ? { start: selectedSourceStart, end: selectedSourceStart } : { start: event.range.start, end: event.range.end };
      })());
  const showLegend = skipped.length > 0 || changes.length > 0;
  // P25-03 C1: closing the band clears the ring in the input too.
  useEffect(() => { if (selectedCardStart === undefined) setSelectedToken(undefined); }, [selectedCardStart]);

  return (
    <div className="lv-text-intake-workspace" data-testid="standard-text-workspace">
      <div className="lv-text-intake-tabs border-b border-[var(--lv-border)] p-2" role="tablist"
        aria-label={"テキスト作業領域"}>
        <button type="button" role="tab" aria-selected={visiblePane === "input"}
          className="lv-button-secondary lv-choice px-3 py-2" onClick={() => setVisiblePane("input")}>{"入力"}</button>
        <button type="button" role="tab" aria-selected={visiblePane === "preview"}
          className="lv-button-secondary lv-choice px-3 py-2" onClick={() => setVisiblePane("preview")}>{"プレビュー"}</button>
      </div>
      <div className="lv-text-intake-grid">
        <section className={"lv-text-intake-pane relative min-w-0 border-r border-[var(--lv-border)]"
          + (visiblePane === "input" ? " lv-text-intake-pane-active" : "")}
          aria-label={"元テキストの入力"}>
          <div className="lv-text-unified-head flex items-center gap-2.5 border-b border-[var(--lv-border)] px-3.5"
            style={{ flex: "none", height: 34 }}>
            <h2 style={{ margin: 0, flex: "none", whiteSpace: "nowrap", fontSize: 12, fontWeight: 700, color: "#a5b2c6" }}>{"入力"}</h2>
            <span data-testid="text-input-hint" title={"小節は | で区切る。貼ったコード譜もそのまま読めます"} style={{
              flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap", fontSize: 11, color: "#7f90aa",
            }}>
              {"小節は | で区切る。貼ったコード譜もそのまま読めます"}
            </span>
            <span style={{ flex: 1, minWidth: 4 }} />
            {hints.key === undefined ? null : (
              <button type="button" style={{ flex: "none" }} className="lv-text-hint-chip" data-testid="text-hint-key"
                data-applied={appliedKey === hints.key ? "true" : undefined}
                disabled={disabled || appliedKey === hints.key} onClick={() => onApplyKey(hints.key!)}>
                {appliedKey === hints.key
                  ? `キー ${displayKey(hints.key) ?? hints.key} 使用中`
                  : `キー ${displayKey(hints.key) ?? hints.key} を使う`}
              </button>
            )}
            {hints.bpm === undefined ? null : (
              <button type="button" style={{ flex: "none" }} className="lv-text-hint-chip" data-testid="text-hint-bpm"
                data-applied={appliedBpm === hints.bpm ? "true" : undefined}
                disabled={disabled || appliedBpm === hints.bpm} onClick={() => onApplyBpm(hints.bpm!)}>
                {appliedBpm === hints.bpm ? `BPM ${hints.bpm} 使用中` : `BPM ${hints.bpm} を使う`}
              </button>
            )}
            {onToggleKeyboard === undefined ? null : (
              <button type="button" data-testid="text-keyboard-toggle" aria-pressed={keyboardOn}
                onClick={onToggleKeyboard} style={{
                  display: "flex", flex: "none", alignItems: "center", gap: 7, height: 28, padding: "0 10px",
                  border: `1px solid ${keyboardOn ? "#42d8c6" : "rgb(150 170 195 / 28%)"}`, borderRadius: 8,
                  background: keyboardOn ? "#123b3a" : "transparent", color: keyboardOn ? "#42d8c6" : "#a5b2c6",
                  fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
                }}>
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
                  <path d="M5.5 3.5v5M10.5 3.5v5M8 8.5v4" />
                </svg>
                {"鍵盤で入れる"}
              </button>
            )}
          </div>
          <TextUnifiedEditor input={input} disabled={disabled}
            placeholder={keyboardOn ? "" : STANDARD_TEXT_PLACEHOLDER} suppressEmptyFace={keyboardOn}
            normalized={unified.normalized} diagnostics={unified.diagnostics} slots={unified.slots}
            {...(selectedRange === undefined ? {} : { selectedRange })}
            hiddenLines={hiddenLines}
            onInput={onInput}
            onSelectToken={selectToken}
            onSelection={onEditorSelection}
            onReadAsCode={onReadAsCode}
            editorRef={editor}
            invalid={Boolean(input.trim()) && errors.length > 0}
            ariaDescribedBy={errors.length > 0 ? "text-progression-format text-progression-diagnostics" : "text-progression-format"}
            onScroll={() => setEditorAway(bottomOf(editor.current))} />
          {pendingText === undefined ? null : (
            <div aria-hidden="true" data-testid="text-pending-bar" style={{
              flex: "none", display: "flex", alignItems: "center", gap: 8, minHeight: 28, padding: "0 10px 0 0",
              fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: "28px", color: "#7f90aa",
            }}>
              <span style={{ flex: "none", width: 40, textAlign: "right", fontSize: 11 }}>{input.split("\n").length + 1}</span>
              <span aria-hidden="true" style={{ flex: "none", width: 3, height: 18, borderRadius: 2, background: "#42d8c6" }} />
              <span style={{ whiteSpace: "pre" }}>{pendingText}</span>
            </div>
          )}
          {keyboardBand}
          {editorAway ? (
            <button type="button" data-testid="text-follow-latest-editor" onClick={() => {
              const editorNode = editor.current;
              if (editorNode !== null) { editorNode.scrollTop = editorNode.scrollHeight; editorNode.dispatchEvent(new Event("scroll")); }
              setEditorAway(false);
            }} style={FOLLOW_LATEST}>{"最新へ"}</button>
          ) : null}
          {showLegend ? (
            <div className="lv-text-deco-legend flex items-center gap-3.5 px-3.5 text-[11px] text-[var(--lv-text-secondary)]"
              data-testid="text-intake-legend" style={{ flex: "none", height: 30, borderTop: "1px solid var(--lv-border)" }}>
              <span className="inline-flex items-center gap-1.5">
                <span style={{ width: 3, height: 12, borderRadius: 2, background: "#42d8c6" }} />{"コードの行"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span style={{ width: 3, height: 12, borderRadius: 2, background: "#3a4a60" }} />{"読み飛ばした行"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <u style={{ textDecoration: "underline dotted #78c8f5", textUnderlineOffset: 3 }}>{"A"}</u>{"表記をそろえた所"}
              </span>
            </div>
          ) : null}
          {errors.length > 0 ? (
            <DiagnosticList diagnostics={errors} locationOf={locationOf} fixOf={fixOf}
              onMove={onMoveDiagnostic} onFix={onFixDiagnostic} />
          ) : null}
        </section>
        <section ref={previewRef} aria-label={"入力中のプレビュー"}
          className={"lv-text-intake-pane min-w-0" + (visiblePane === "preview" ? " lv-text-intake-pane-active" : "")}
          data-testid="standard-text-preview">
          <div className="lv-text-unified-head flex items-center gap-2.5 border-b border-[var(--lv-border)] px-3.5"
            style={{ flex: "none", height: 34 }}>
            <h2 style={{ margin: 0, flex: "none", whiteSpace: "nowrap", fontSize: 12, fontWeight: 700, color: "#a5b2c6" }}>{"プレビュー"}</h2>
            <span style={{ flex: "none", whiteSpace: "nowrap", fontSize: 11, color: "#7f90aa" }}>{"カードを選ぶと鳴ります"}</span>
            <span style={{ flex: 1 }} />
            <span style={{ flex: "none", whiteSpace: "nowrap", fontSize: 12, color: "#a5b2c6" }} data-testid="text-preview-count">
              {errors.length > 0
                ? `${unified.bars.length} 小節のうち ${readableBars} 小節は読めています`
                : `${unified.bars.length} 小節 · ${codeCount} コード`}
            </span>
          </div>
          <div className="lv-text-preview-scroll" data-testid="standard-text-preview-scroll"
            ref={previewScrollRef} onScroll={() => setPreviewAway(bottomOf(previewScrollRef.current))}
            style={{ padding: "12px 14px" }}>
            {input.trim() === "" ? (keyboardOn ? null : <EmptyPreview />) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {previewItems.map((item, index) => item.kind === "memo" ? (
                  <button type="button" key={index} data-testid="extended-text-section"
                    data-source-start={item.span.start}
                    className="block w-full border-l-2 border-[var(--lv-accent)] bg-[var(--lv-accent-soft)] p-2 text-left text-xs"
                    onClick={() => selectSource(item.span, false)}>{item.text}</button>
                ) : (
                  <div key={index} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {item.group.heading === undefined ? null : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span data-testid="text-preview-heading" style={{
                          padding: "0 8px", border: "1px solid #4a4290", borderRadius: 6, fontSize: 11,
                          fontWeight: 700, lineHeight: "20px", color: "#c9b7ff",
                        }}>{item.group.heading.name}</span>
                        <span aria-hidden="true" style={{ flex: 1, height: 1, background: "rgb(150 170 195 / 14%)" }} />
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {chunk(item.group.bars, 4).map((row, rowIndex, rows) => (
                        <div key={rowIndex} className="lv-text-intake-bars" data-testid="text-preview-row">
                          {row.map((bar) => <PreviewBarCard key={bar.number} bar={bar}
                            selectedCardStart={selectedCardStart} disabled={disabled}
                            {...(harmonyFor === undefined ? {} : { harmonyFor })}
                            onSelect={selectCard} onBarSelect={(span) => { selectSource(span, false); onSeekBar(bar.number); }}
                            {...(onCardHover === undefined ? {} : { onHover: onCardHover })}
                            {...(onCardMenu === undefined ? {} : { onMenu: onCardMenu })} />)}
                          {suggestion !== undefined && index === lastGroupIndex && rowIndex === rows.length - 1 ? <SuggestionCell suggestion={suggestion} /> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {pendingCards.length === 0 && heldCard === undefined ? null : (
              <div className="lv-text-intake-bars" data-testid="text-pending-row" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                <PendingBarCard number={unified.bars.length + 1} cards={pendingCards}
                  selectedIndex={selectedPendingIndex} onSelect={onSelectPending} held={heldCard} />
              </div>
            )}
          </div>
          {previewAway ? (
            <button type="button" data-testid="text-follow-latest-preview" onClick={() => {
              if (previewScrollRef.current !== null) previewScrollRef.current.scrollTop = previewScrollRef.current.scrollHeight;
              setPreviewAway(false);
            }} style={FOLLOW_LATEST}>{"最新へ"}</button>
          ) : null}
        </section>
      </div>
    </div>
  );
}

const FOLLOW_LATEST = {
  position: "absolute", right: 10, bottom: 10, zIndex: 5, height: 26, padding: "0 10px",
  border: "1px solid rgb(150 170 195 / 28%)", borderRadius: 8, background: "#111b2a",
  color: "#a5b2c6", fontSize: 11, whiteSpace: "nowrap",
} as const;

/** P24-06: the open bar at the end of the preview (its chords are not in the text yet) and the held chord. */
/** P25 V23: the dotted 「＋」 after the last bar (or in the palette's open pending bar). */
function SuggestionCell({ suggestion }: { readonly suggestion: NonNullable<Props["suggestion"]> }) {
  const ref = useRef<HTMLButtonElement>(null);
  const rectOf = () => ref.current?.getBoundingClientRect();
  const open = () => { const rect = rectOf(); if (rect !== undefined) suggestion.onOpen(rect); };
  const openFromMenu = (event: React.MouseEvent) => { event.preventDefault(); open(); };
  if (suggestion.pending.length > 0) {
    const filled = suggestion.pending.reduce((total, card) => total + card.beats, 0);
    const remaining = Math.max(0, suggestion.beatsPerBar - filled);
    return <div data-testid="text-suggestion-ghost" style={{
      minHeight: 112, height: "100%", boxSizing: "border-box", display: "flex", gap: 4, padding: 6,
      border: "1.5px dashed rgba(66,216,198,.4)", borderRadius: 10, background: "transparent",
    }}>
      {suggestion.pending.map((card, index) => (
        <div key={index} data-pending="true" data-testid={card.rest ? "text-preview-rest" : "text-preview-card"} style={{
          flex: `${card.beats} 1 0`, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center",
          border: "1px solid rgba(150,170,195,.2)", borderTop: "2px solid #42d8c6", borderRadius: 8, background: "#111b2b",
          color: "#f2f6fc", padding: "0 4px",
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {card.rest ? "休符" : displayChordLabel(card.label)}
          </span>
        </div>
      ))}
      <button ref={ref} type="button" aria-label="次のコードを足す" aria-expanded={suggestion.open} onClick={open} onContextMenu={openFromMenu}
        className="lv-suggestion-ghost" style={{
          flex: `${Math.max(0.5, remaining)} 1 0`, minWidth: 24, padding: 0, border: "1.5px dashed rgba(66,216,198,.4)",
          borderRadius: 8, background: "rgba(66,216,198,.04)", color: "#42d8c6", fontSize: 20, fontWeight: 400, cursor: "pointer",
        }}>{"+"}</button>
    </div>;
  }
  return <button ref={ref} type="button" data-testid="text-suggestion-ghost" aria-label="次のコードを足す" aria-expanded={suggestion.open}
    onClick={open} onContextMenu={openFromMenu} className="lv-suggestion-ghost" style={{
      minHeight: 104, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "stretch",
      padding: "6px 8px 8px", border: "1.5px dashed rgba(66,216,198,.4)", borderRadius: 10, background: "transparent",
      color: "#9fb0c6", cursor: "pointer", font: "inherit",
    }}>
    <span style={{ fontSize: 15, alignSelf: "flex-start" }}>{suggestion.number}</span>
    <span style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#42d8c6", fontSize: 26, fontWeight: 400 }}>{"+"}</span>
  </button>;
}

function PendingBarCard({ number, cards, selectedIndex, onSelect, held }: {
  readonly number: number;
  readonly cards: readonly PendingPreviewCard[];
  readonly selectedIndex?: number;
  readonly onSelect?: (index: number) => void;
  readonly held?: HeldPreviewCard;
}) {
  return <article data-testid="extended-text-bar" data-bar={number} data-pending="true" style={{
    position: "relative", display: "flex", flexDirection: "column", gap: 5, minHeight: 112,
    boxSizing: "border-box", padding: 6, border: "solid 1px rgb(150 170 195 / 14%)", borderRadius: 10, background: "#0d1522",
  }}>
    <span style={{ alignSelf: "flex-start", fontSize: 11, lineHeight: "14px", color: "#7f90aa" }}>{String(number)}</span>
    <div style={{ flex: 1, display: "flex", gap: 4 }}>
      {cards.map((card, index) => {
        const split = splitShownChord(card.label);
        const selected = index === selectedIndex;
        if (card.rest) {
          return <button key={index} type="button" data-testid="text-preview-rest" data-pending="true"
            data-selected={selected} aria-label={"休符"} onClick={() => onSelect?.(index)} style={{
              flex: 1, minWidth: 0, border: `1px ${selected ? "solid #42d8c6" : "dashed rgb(150 170 195 / 28%)"}`,
              borderRadius: 8, background: "transparent", color: "#7f90aa", fontSize: 12,
              boxShadow: selected ? "0 0 0 2px #42d8c6" : "none",
            }}>{"休"}</button>;
        }
        return <button key={index} type="button" data-testid="text-preview-band" data-pending="true"
          data-selected={selected} data-chord={card.label}
          onClick={() => onSelect?.(index)} style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center", justifyContent: "flex-start",
            gap: 4, padding: "4px 8px", textAlign: "left",
            border: `1px solid ${selected ? "#42d8c6" : "#2b3c50"}`, borderTop: `2px solid ${roleColor(card.role)}`,
            borderRadius: 8, background: selected ? "#16403f" : "#141f2c", color: "#f2f6fc",
            boxShadow: selected ? "0 0 0 2px #42d8c6" : "none",
          }}>
          <span style={{ fontWeight: 700, lineHeight: 1.1, whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 19 }}>{split.root}</span>
            <span style={{ fontSize: 12, color: "#c9d3e2" }}>{split.quality}</span>
          </span>
          {card.voicing === undefined ? null : (
            <span style={{ fontSize: 9.5, lineHeight: "11px", color: "#a5b2c6", whiteSpace: "nowrap" }}>{card.voicing}</span>
          )}
        </button>;
      })}
      {held === undefined ? null : (() => {
        const split = splitShownChord(held.label);
        return <div data-testid="text-preview-held-card" data-chord={held.label} style={{
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start",
          justifyContent: "center", gap: 3, padding: "4px 8px", border: "1px dashed #42d8c6", borderRadius: 8,
          background: "transparent", opacity: 0.75,
        }}>
          {held.degree === undefined ? null : (
            <span style={{ fontSize: 11, fontWeight: 700, color: roleColor(held.role) }}>{held.degree}</span>
          )}
          <span style={{ fontWeight: 700, lineHeight: 1.1, whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 19 }}>{split.root}</span>
            <span style={{ fontSize: 12, color: "#c9d3e2" }}>{split.quality}</span>
          </span>
          <span style={{ fontSize: 10, color: "#7f90aa", whiteSpace: "nowrap" }}>{"離すと入ります"}</span>
        </div>;
      })()}
    </div>
  </article>;
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/** One bar's face: the bar number, then a card per chord (a rest card for `_`, a red one for unreadable text). */
function PreviewBarCard({ bar, selectedCardStart, disabled, harmonyFor, onSelect, onBarSelect, onHover, onMenu }: {
  readonly bar: UnifiedPreviewBar;
  readonly selectedCardStart?: number;
  readonly disabled: boolean;
  readonly harmonyFor?: (sourceStart: number, beat?: number) => PreviewHarmony | undefined;
  readonly onSelect: (card: UnifiedPreviewCard) => void;
  readonly onBarSelect: (span: { start: number; end: number }) => void;
  readonly onHover?: (start?: number) => void;
  readonly onMenu?: (start: number, x: number, y: number) => void;
}) {
  const errorBar = !bar.readable;
  return <article data-testid="extended-text-bar" data-state={bar.wholeError === undefined ? "parsed" : "error"}
    data-bar={bar.number}
    style={{
      position: "relative",
      display: "flex", flexDirection: "column", gap: 5, minHeight: 112, boxSizing: "border-box", padding: 6,
      border: `${bar.wholeError === undefined ? "solid" : "dashed"} 1px ${bar.wholeError === undefined ? (errorBar ? "#6a2a33" : "rgb(150 170 195 / 14%)") : "#ee6b73"}`,
      borderRadius: 10, background: bar.wholeError === undefined ? "#0d1522" : "#2a141a",
    }}>
    <button type="button" data-testid="text-preview-bar-select" onClick={() => onBarSelect(bar.sourceSpan)} style={{
      alignSelf: "flex-start", fontSize: 11, lineHeight: "14px", color: errorBar ? "#ffb3b8" : "#7f90aa",
      background: "transparent", border: 0, padding: 0, cursor: "pointer", font: "inherit",
    }}>{String(bar.number)}</button>
    {bar.wholeError === undefined ? (
      <div style={{ flex: 1, display: "flex", gap: 4 }}>
        {bar.cards.map((card, index) => <CardFace key={index} card={card}
          selected={selectedCardStart !== undefined && card.span.start === selectedCardStart}
          harmony={card.rest || card.error !== undefined ? undefined : harmonyFor?.(card.spanStart, card.beat)}
          disabled={disabled} onSelect={onSelect} {...(onHover === undefined ? {} : { onHover })}
          {...(onMenu === undefined ? {} : { onMenu })} />)}
      </div>
    ) : (
      <button type="button" data-testid="text-preview-error" onClick={() => onBarSelect(bar.sourceSpan)}
        className="w-full"
        style={{ flex: 1, display: "block", width: "100%", border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }}>
        <span className="break-words [overflow-wrap:anywhere]" style={{
          display: "block", fontSize: 12, color: "#c9d3e2", fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap",
        }}>{bar.wholeError.raw}</span>
        <span style={{ display: "block", marginTop: 8, fontSize: 11, color: "#ffb3b8" }}>{"読めません"}</span>
        <span role="note" style={{ display: "block", marginTop: 2, fontSize: 11, color: "#c9d3e2" }}>{bar.wholeError.message}</span>
      </button>
    )}
    <span aria-hidden="true" data-testid="text-smooth-playhead" className="lv-text-smooth-playhead" />
  </article>;
}

function CardFace({ card, selected, harmony, disabled, onSelect, onHover, onMenu }: {
  readonly card: UnifiedPreviewCard;
  readonly selected: boolean;
  readonly harmony?: PreviewHarmony;
  readonly disabled: boolean;
  readonly onSelect: (card: UnifiedPreviewCard) => void;
  readonly onHover?: (start?: number) => void;
  readonly onMenu?: (start: number, x: number, y: number) => void;
}) {
  // P25-16 review 3: the mark's short word follows the card's own width, like the Voicing Loop cards.
  const [narrow, setNarrow] = useState(false);
  const faceRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = faceRef.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setNarrow(element.getBoundingClientRect().width < 132));
    observer.observe(element);
    return () => observer.disconnect();
  }, [card.span.start]);
  const cardMenu = (event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => {
    if (onMenu === undefined) return;
    event.preventDefault();
    if ("clientX" in event) { onMenu(card.span.start, event.clientX, event.clientY); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    onMenu(card.span.start, rect.left + 12, rect.bottom - 4);
  };
  const cardKeys = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) cardMenu(event);
  };
  const hover = onHover === undefined ? {} : {
    onMouseEnter: () => onHover(card.span.start),
    onMouseLeave: () => onHover(undefined),
  };
  if (card.rest) {
    return <button type="button" data-testid="text-preview-rest" data-card-start={card.span.start} aria-label={"休符"} disabled={disabled}
      onClick={() => onSelect(card)} onContextMenu={cardMenu} onKeyDown={cardKeys} {...hover} style={{
        flex: 1, minWidth: 0, border: "1px dashed rgb(150 170 195 / 28%)", borderRadius: 8,
        background: "transparent", color: "#7f90aa", fontSize: 12,
      }}>{"休"}</button>;
  }
  if (card.error !== undefined) {
    const split = splitErrorText(card.written);
    return <button type="button" data-testid="text-preview-card-error" data-card-start={card.span.start} title={card.error} aria-label={card.error}
      disabled={disabled} onClick={() => onSelect(card)} onContextMenu={cardMenu} onKeyDown={cardKeys} {...hover} style={{
        flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start",
        justifyContent: "center", gap: 4, padding: "4px 8px", textAlign: "left",
        border: "1px dashed #ee6b73", borderTop: "2px dashed #ee6b73", borderRadius: 8, background: "#2a141a",
      }}>
      <span style={{ fontSize: 11, fontWeight: 700, lineHeight: "13px", whiteSpace: "nowrap", color: "#ffb3b8" }}>{"読めません"}</span>
      <span style={{ fontWeight: 700, lineHeight: 1.1, whiteSpace: "nowrap" }}>
        <span style={{ fontSize: 19, color: "#ffb3b8" }}>{split.root}</span>
        <span style={{ fontSize: 12, color: "#c9d3e2" }}>{split.quality}</span>
      </span>
    </button>;
  }
  const label = harmony?.name ?? card.label ?? card.written;
  const split = splitShownChord(label);
  const role = harmony?.role;
  return <button type="button" ref={faceRef} data-testid="text-preview-band" className="lv-text-card-face" data-card-start={card.span.start}
    data-in-scope={harmony?.inScope ? "true" : undefined}
    onContextMenu={cardMenu} onKeyDown={cardKeys} {...hover}
    data-chord={card.written} data-source-start={card.span.start} data-source-end={card.span.end}
    data-selected={selected} data-role={role || undefined}
    data-left={String(card.left)} data-width={String(card.width)}
    aria-pressed={selected} title={`${displayChordLabel(label)}${harmony?.dots === undefined ? "" : ` · ${harmony.dots.title}`}${harmony?.fallback ? ` · ${harmony.fallback}` : ""}`} disabled={disabled}
    onClick={() => onSelect(card)} style={{
      position: "relative",
      flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start",
      justifyContent: "center", gap: 4, padding: "4px 8px", textAlign: "left",
      border: `1px solid ${selected || harmony?.inScope ? "#42d8c6" : "#2b3c50"}`,
      borderTop: `2px solid ${roleColor(role)}`,
      borderRadius: 8, background: selected ? "#16403f" : harmony?.inScope ? "#11292c" : "#141f2c",
      boxShadow: selected ? "0 0 0 2px #42d8c6" : "none", color: "#f2f6fc",
    }}>
    {harmony?.fallback ? <span data-testid="text-preview-fallback" role="img" aria-label={harmony.fallback} title={harmony.fallback}
      className="absolute top-0.5 rounded bg-amber-400/20 px-1 text-[9px] text-amber-200" style={{ right: 4 }}>{narrow ? "代" : "代わり"}</span> : null}
    <span data-testid="text-preview-degree" className="lv-text-card-degree" style={{
      fontSize: 11, fontWeight: 700, lineHeight: "13px", whiteSpace: "nowrap", color: roleColor(role),
    }}>{harmony?.degree ?? ""}</span>
    <span style={{ fontWeight: 700, lineHeight: 1.1, whiteSpace: "nowrap" }}>
      <span className="lv-text-card-root" style={{ fontSize: 19 }}>{split.root}</span>
      <span className="lv-text-card-quality" style={{ fontSize: 12, color: "#c9d3e2" }}>{split.quality}</span>
    </span>
    {harmony === undefined ? null : (
      // P25-03 C10: the sounding notes as dots (8px band + 3px gap = the old 11px line, so the card keeps its size).
      <span aria-hidden="true" data-testid="text-card-dots" className="lv-text-card-voicing" style={{
        position: "relative", display: "block", alignSelf: "stretch", height: 8, marginTop: 3, borderRadius: 4,
        background: "rgb(150 170 195 / 13%)",
      }}>
        {(harmony.dots?.notes ?? []).map((note) => <span key={note} data-testid="text-card-dot" data-note={note} style={{
          position: "absolute", top: 2, left: `${cardDotPercent(note)}%`, width: 4, height: 4, marginLeft: -2, borderRadius: "50%",
          background: harmony.dots!.color,
        }} />)}
      </span>
    )}
  </button>;
}

/** C10: (note − 36) ÷ 48, notes outside 36–84 held at the ends. */
export function cardDotPercent(note: number): number {
  return Math.round(((Math.min(84, Math.max(36, note)) - 36) / 48) * 1000) / 10;
}

export function roleColor(role: string | undefined): string {
  switch (role) {
    case "T": return "#6aa8ff";
    case "SD": return "#f5dc4a";
    case "SDm": return "#c9b7ff";
    case "D": return "#ff6b7d";
    default: return "#42d8c6";
  }
}

/** The shown chord split into the large root and the smaller quality (with the app's ♯/♭ symbols). */
export function splitShownChord(label: string): { root: string; quality: string } {
  const parts = splitChordLabel(label);
  if (parts === undefined) return { root: displayChordLabel(label), quality: "" };
  return { root: `${parts.letter}${parts.accidental}`, quality: parts.rest };
}

/** An unreadable token keeps its own characters: 「X」 large and 「m7」 small (the design's red card). */
function splitErrorText(text: string): { root: string; quality: string } {
  const match = /^([A-Za-z])(.*)$/.exec(text.trim());
  return match === null ? { root: text.trim(), quality: "" } : { root: match[1]!, quality: match[2]! };
}

/** The error list under the input: one place for every reason, with the two ways to act on it. */
function DiagnosticList({ diagnostics, locationOf, fixOf, onMove, onFix }: {
  readonly diagnostics: readonly UnifiedDiagnostic[];
  readonly locationOf: (diagnostic: UnifiedDiagnostic) => string;
  readonly fixOf: (diagnostic: UnifiedDiagnostic) => string | undefined;
  readonly onMove: (diagnostic: UnifiedDiagnostic) => void;
  readonly onFix: (diagnostic: UnifiedDiagnostic, replacement: string) => void;
}) {
  return (
    <section id="text-progression-diagnostics" role="status" aria-live="polite" data-testid="text-progression-diagnostics" data-selectable
      style={{
        flex: "0 1 auto", display: "flex", flexDirection: "column", gap: 8, overflow: "auto",
        padding: "12px 14px 14px", borderTop: "1px solid var(--lv-border)",
      }}>
      <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "#ffb3b8" }}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#ee6b73"
          strokeWidth="1.6" strokeLinecap="round">
          <circle cx="7" cy="7" r="5.6" /><path d="M7 4v3.6M7 9.9v.1" />
        </svg>
        {`直す所が ${diagnostics.length} か所あります`}
      </h3>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
      {diagnostics.map((diagnostic, index) => {
        const fix = fixOf(diagnostic);
        return (
          <li key={`${diagnostic.code}:${diagnostic.rawSpan.start}:${index}`} data-diagnostic={diagnostic.code}
            className="min-w-0 [overflow-wrap:anywhere]"
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
              border: "1px solid #6a2a33", borderRadius: 10, background: "#2a141a",
            }}>
            <span style={{ flex: "none", fontSize: 11, color: "#ffb3b8", whiteSpace: "nowrap" }}>{locationOf(diagnostic)}</span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]" style={{ fontSize: 12, color: "#f2f6fc" }}>
              {diagnostic.message}
            </span>
            {fix === undefined ? null : (
              <button type="button" data-testid="text-diagnostic-fix" onClick={() => onFix(diagnostic, fix)} style={{
                flex: "none", height: 26, padding: "0 10px", border: "1px solid #42d8c6", borderRadius: 7,
                background: "#123b3a", color: "#42d8c6", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
              }}>{`${fix} に直す`}</button>
            )}
            <button type="button" data-testid="text-diagnostic-move" onClick={() => onMove(diagnostic)} style={{
              flex: "none", height: 26, padding: "0 10px", border: "1px solid rgb(150 170 195 / 34%)", borderRadius: 7,
              background: "transparent", color: "#c9d3e2", fontSize: 11, whiteSpace: "nowrap",
            }}>{"ここへ移動"}</button>
          </li>
        );
      })}
      </ul>
    </section>
  );
}

/** The empty preview: four dashed bar faces and the seven-line quick reference. */
function EmptyPreview() {
  return <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
    <div aria-hidden="true" className="lv-text-intake-bars" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
      {[1, 2, 3, 4].map((number) => <div key={number} data-testid="text-empty-bar" style={{
        height: 112, boxSizing: "border-box", padding: 6, border: "1px dashed rgb(150 170 195 / 28%)",
        borderRadius: 10, fontSize: 11, color: "#7f90aa",
      }}>{number}</div>)}
    </div>
  </div>;
}
