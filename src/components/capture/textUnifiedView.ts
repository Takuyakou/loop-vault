import type {
  TextProgressionDiagnostic,
  TextProgressionEvent,
  TextProgressionParseResult,
  TextProgressionToken,
} from "../../domain/textProgression";
import { readableTextToken, type UnifiedTextResult } from "../../domain/textUnified";

/**
 * P24-05 05-b: the one result, in the shapes the preview and the voicing controls already speak.
 *
 * The cards, the selected-card row and the playback were written against the standard parser's event
 * list; a harmonic span carries the same information (where it starts, how long it lasts, which chord).
 * This adapter is the only place that translation happens.
 */
export function unifiedEvents(result: UnifiedTextResult): TextProgressionEvent[] {
  const bar = result.beatsPerBar > 0 ? result.beatsPerBar : 4;
  return result.spans.map((span) => ({
    raw: span.writtenChord,
    canonical: span.chord.label,
    range: span.sourceSpan,
    bar: Math.floor(span.startBeat / bar) + 1,
    startBeat: span.startBeat % bar + 1,
    durationBeats: span.durationBeats,
    chord: span.chord,
  }));
}

/** The standard-shaped view of the one result: the preview and the voicing row keep their own shapes. */
export function unifiedAsPreviewResult(
  result: UnifiedTextResult,
  keyState: TextProgressionParseResult["keyState"] = { kind: "unknown" },
): TextProgressionParseResult {
  const diagnostics: TextProgressionDiagnostic[] = result.diagnostics
    .filter((diagnostic) => diagnostic.severity === "ERROR")
    .map((diagnostic) => ({
      code: "invalid-chord",
      message: diagnostic.message,
      range: diagnostic.rawSpan,
      bar: barAt(result, diagnostic.rawSpan.start),
    }));
  const tokens: TextProgressionToken[] = result.slots.map((slot, index) => ({
    index,
    raw: slot.raw,
    range: slot.span,
    bar: slot.bar,
    startBeat: (slot.startBeat % Math.max(1, result.beatsPerBar)) + 1,
    durationBeats: slot.durationBeats as 1 | 2 | 4,
    ...(slot.chord === undefined ? {} : { canonical: slot.chord.label, chord: slot.chord }),
    diagnostics: [],
  }));
  return {
    input: result.source,
    notation: "bar",
    bars: result.bars.length,
    scoreLengthBeats: result.scoreLengthBeats,
    tokens,
    events: unifiedEvents(result),
    diagnostics,
    keyState,
    canConvert: result.canConvert,
  };
}

/** The bar a typed offset sits in (1-based); input-wide problems belong to the first bar. */
export function barAt(result: UnifiedTextResult, offset: number): number {
  const spans = result.barSourceSpans;
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index]!;
    if (offset >= span.start && offset < Math.max(span.end, span.start + 1)) return index + 1;
  }
  return 1;
}

/**
 * One card of the preview: a chord, a rest, or a run of characters the one grammar could not read.
 * The cards keep the span they point at in the typed text, so the input can ring the same characters.
 */
export interface UnifiedPreviewCard {
  readonly written: string;
  /** The chord to show (the canonical label), when the card is readable. */
  readonly label?: string;
  readonly chord?: TextProgressionEvent["chord"];
  readonly span: { readonly start: number; readonly end: number };
  /** The start of the harmonic span this card belongs to (the selection's identity). */
  readonly spanStart: number;
  readonly rest: boolean;
  /** Why the characters could not be read (the card is not playable). */
  readonly error?: string;
  /** Where the card sits in the bar, in percent (the playing position's highlight). */
  readonly left: number;
  readonly width: number;
  /** P24-fix-1: the absolute beat the card is written at (its own attack's identity). */
  readonly beat?: number;
}

export interface UnifiedPreviewBar {
  readonly number: number;
  readonly sourceSpan: { readonly start: number; readonly end: number };
  readonly cards: readonly UnifiedPreviewCard[];
  /** Set when the whole bar could not be read: the original characters stay visible inside it. */
  readonly wholeError?: { readonly message: string; readonly raw: string };
  /** A bar is readable when no error falls inside it. */
  readonly readable: boolean;
}

export interface UnifiedPreviewGroup {
  readonly heading?: { readonly name: string; readonly span: { readonly start: number; readonly end: number } };
  readonly bars: readonly UnifiedPreviewBar[];
}

export type UnifiedPreviewItem =
  | { readonly kind: "memo"; readonly text: string; readonly span: { readonly start: number; readonly end: number } }
  | { readonly kind: "group"; readonly group: UnifiedPreviewGroup };

/** The preview's bars and headings, in the order the person typed them. */
export function buildUnifiedPreview(result: UnifiedTextResult): readonly UnifiedPreviewItem[] {
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "ERROR");
  const headingOffsets = result.normalized.headings.map((line) => ({
    name: line.heading ?? "",
    span: {
      start: result.normalized.lineRawStarts[line.line - 1] ?? 0,
      end: (result.normalized.lineRawStarts[line.line - 1] ?? 0) + line.raw.length,
    },
  })).sort((left, right) => left.span.start - right.span.start);
  const slotSpans = result.spans.map((span) => span.sourceSpan.start);
  const spanStartOf = (start: number): number => {
    const found = result.spans.find((span) => start >= span.sourceSpan.start && start < Math.max(span.sourceSpan.end, span.sourceSpan.start + 1))
      ?? result.spans.find((span) => span.sourceSpan.start === start);
    if (found !== undefined) return found.sourceSpan.start;
    let last = start;
    for (const value of slotSpans) { if (value <= start) last = value; }
    return last;
  };
  const bars: Array<{ bar: UnifiedPreviewBar; offset: number; headingIndex: number }> = [];
  for (let index = 0; index < result.bars.length; index += 1) {
    const number = index + 1;
    const sourceSpan = result.barSourceSpans[index] ?? { start: 0, end: 0 };
    const barEnd = Math.max(sourceSpan.end, sourceSpan.start + 1);
    const slots = result.slots.filter((slot) => slot.bar === number);
    const barErrors = errors.filter((diagnostic) => {
      const start = diagnostic.rawSpan.start;
      return start >= sourceSpan.start && start < barEnd;
    });
    const cards: UnifiedPreviewCard[] = [];
    const barBeats = result.beatsPerBar > 0 ? result.beatsPerBar : 4;
    for (const slot of slots) {
      if (slot.kind === "hold") continue;
      const left = Math.max(0, Math.min(100, (slot.startBeat - 1) / barBeats * 100));
      const width = Math.max(0, Math.min(100, slot.durationBeats / barBeats * 100));
      if (slot.kind === "rest") {
        cards.push({ written: slot.raw, span: slot.span, spanStart: slot.span.start, rest: true, left, width });
        continue;
      }
      if (slot.chord === undefined) continue;
      cards.push({
        written: slot.raw,
        label: slot.chord.label,
        chord: slot.chord,
        span: slot.span,
        spanStart: spanStartOf(slot.span.start),
        rest: false,
        left,
        width,
        beat: (slot.bar - 1) * barBeats + (slot.startBeat - 1),
      });
    }
    // A bar the grammar could not segment still keeps its readable words playable (the design's error bar:
    // Fmaj7 stays a card, Xm7 becomes the red card). The bar's own characters are the only source here.
    if (slots.length === 0 && barErrors.length > 0) {
      const rawBar = result.source.slice(sourceSpan.start, sourceSpan.end);
      const words = [...rawBar.matchAll(/[^\s|]+/g)].map((match) => ({
        word: match[0],
        start: sourceSpan.start + (match.index ?? 0),
        end: sourceSpan.start + (match.index ?? 0) + match[0].length,
      }));
      words.forEach((word, position) => {
        const chord = readableTextToken(word.word);
        const failure = barErrors.find((diagnostic) => diagnostic.rawSpan.start >= word.start
          && diagnostic.rawSpan.start < word.end);
        const left = Math.max(0, Math.min(100, position / Math.max(1, words.length) * 100));
        const width = Math.max(10, 100 / Math.max(1, words.length));
        if (chord !== undefined && failure === undefined) {
          cards.push({
            written: word.word,
            label: chord.label,
            chord,
            span: { start: word.start, end: word.end },
            spanStart: spanStartOf(word.start),
            rest: false,
            left,
            width,
          });
          return;
        }
        cards.push({
          written: word.word,
          span: { start: word.start, end: word.end },
          spanStart: word.start,
          rest: false,
          error: failure?.message ?? `「${word.word}」はコードとして読めません。`,
          left,
          width,
        });
      });
    } else {
      // Characters no slot covers are the cards the grammar could not read.
      for (const diagnostic of barErrors) {
        const covered = slots.some((slot) => diagnostic.rawSpan.start >= slot.span.start
          && diagnostic.rawSpan.start < Math.max(slot.span.end, slot.span.start + 1));
        if (covered) continue;
        const barLength = Math.max(1, barEnd - sourceSpan.start);
        cards.push({
          written: diagnostic.token,
          span: diagnostic.rawSpan,
          spanStart: diagnostic.rawSpan.start,
          rest: false,
          error: diagnostic.message,
          left: Math.max(0, Math.min(100, (diagnostic.rawSpan.start - sourceSpan.start) / barLength * 100)),
          width: Math.max(10, Math.min(100, Math.max(1, diagnostic.rawSpan.end - diagnostic.rawSpan.start) / barLength * 100)),
        });
      }
    }
    cards.sort((left, right) => left.span.start - right.span.start);
    const wholeError = cards.every((card) => card.error !== undefined) && barErrors.length > 0 && cards.length <= 1
      ? { message: cards[0]?.error ?? barErrors[0]!.message, raw: result.source.slice(sourceSpan.start, sourceSpan.end) }
      : undefined;
    const headingIndex = headingOffsets.reduce((found, heading, at) => (heading.span.start < sourceSpan.start ? at : found), -1);
    bars.push({
      offset: sourceSpan.start,
      headingIndex,
      bar: {
        number,
        sourceSpan,
        cards,
        ...(wholeError === undefined ? {} : { wholeError }),
        readable: barErrors.length === 0,
      },
    });
  }
  const memos = result.sections
    .filter((section) => section.kind === "comment" && !/^\s*#\s*(Key|BPM)\s*:/i.test(section.raw))
    .map((section) => ({ offset: section.span.start, text: section.raw.trim().replace(/^#\s*/, ""), span: section.span }));
  const entries: Array<{ offset: number; order: number; bar?: typeof bars[number]; memo?: typeof memos[number] }> = [
    ...bars.map((bar) => ({ offset: bar.offset, order: 1, bar })),
    ...memos.map((memo) => ({ offset: memo.offset, order: 0, memo })),
  ].sort((left, right) => left.offset - right.offset || left.order - right.order);
  const items: UnifiedPreviewItem[] = [];
  let current: { headingIndex: number; bars: UnifiedPreviewBar[] } | undefined;
  const flush = () => {
    if (!current || current.bars.length === 0) { current = undefined; return; }
    items.push({
      kind: "group",
      group: {
        ...(current.headingIndex >= 0 ? { heading: headingOffsets[current.headingIndex]! } : {}),
        bars: current.bars,
      },
    });
    current = undefined;
  };
  let previousBar = 0;
  for (const entry of entries) {
    if (entry.memo) {
      flush();
      items.push({ kind: "memo", text: entry.memo.text, span: entry.memo.span });
      continue;
    }
    const bar = entry.bar!.bar;
    const headingIndex = entry.bar!.headingIndex;
    if (!current || current.headingIndex !== headingIndex || bar.number !== previousBar + 1) {
      flush();
      current = { headingIndex, bars: [] };
    }
    current.bars.push(bar);
    previousBar = bar.number;
  }
  flush();
  return items;
}
