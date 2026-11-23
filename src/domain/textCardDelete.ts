import { parseUnifiedText, type UnifiedTextOptions, type UnifiedTextResult } from "./textUnified";
import type { ExtendedTextSlot } from "./extendedTextProgression";

/**
 * P24-07 item 3: deleting a card edits the typed text.
 *
 * The card's chord token and the `=` (hold) / `%` (repeat) tokens that continue it in the same bar go; the
 * bar's remaining chords are read again with the same equal division. An emptied bar (`| … |`) is removed,
 * and an emptied line is removed with one newline. Rests and unreadable tokens use the same rule. The
 * caller gets the new text; Ctrl+Z is the caller's job.
 */
export interface DeleteTextCardResult {
  readonly text: string;
  readonly removed: boolean;
}

export function deleteTextCard(
  input: string,
  options: UnifiedTextOptions,
  cardStart: number,
): DeleteTextCardResult {
  const parsed = parseUnifiedText(input, options);
  const slot = parsed.slots.find((item) => cardStart >= item.span.start && cardStart < item.span.end);
  if (slot !== undefined) return deleteSlot(input, parsed, slot);
  const word = wordAt(input, cardStart);
  if (word === undefined) return { text: input, removed: false };
  return deleteRawWord(input, parsed, word);
}

function wordAt(input: string, offset: number): { start: number; end: number } | undefined {
  const line = lineRangeOf(input, offset);
  const text = input.slice(line.start, line.end);
  const pattern = /[^\s|]+/g;
  for (const match of text.matchAll(pattern)) {
    const start = line.start + (match.index ?? 0);
    const end = start + match[0].length;
    if (offset >= start && offset < end) return { start, end };
  }
  return undefined;
}

function deleteSlot(
  input: string,
  parsed: UnifiedTextResult,
  slot: ExtendedTextSlot,
): DeleteTextCardResult {
  const line = lineRangeOf(input, slot.span.start);
  const barSlots = parsed.slots
    .filter((item) => item.bar === slot.bar && item.span.start >= line.start && item.span.start < line.end)
    .sort((left, right) => left.span.start - right.span.start);
  const at = barSlots.findIndex((item) => item === slot);
  if (at < 0) return { text: input, removed: false };
  const removals: ExtendedTextSlot[] = [slot];
  for (let index = at + 1; index < barSlots.length; index += 1) {
    const next = barSlots[index]!;
    // `=` and `%` continue the card they follow; a later chord/rest is another card.
    if (next.kind === "hold" || next.kind === "reattack") removals.push(next);
    else break;
  }
  const remaining = barSlots.filter((item) => !removals.includes(item));
  const barRange = parsed.barSourceSpans[slot.bar - 1];
  const barStart = barRange === undefined ? slot.span.start : barRange.start;
  const barEnd = barRange === undefined ? slot.span.end : barRange.end;
  const nextLine = editLine(input, line.start, line.end, (text) => {
    if (remaining.length === 0) return removeBarFromLine(text, barStart - line.start, barEnd - line.start);
    const ranges = removals
      .map((item) => ({ start: item.span.start - line.start, end: item.span.end - line.start }))
      .sort((left, right) => right.start - left.start);
    let edited = text;
    for (const range of ranges) edited = edited.slice(0, range.start) + edited.slice(range.end);
    return cleanupLine(edited);
  });
  return { text: nextLine, removed: nextLine !== input };
}

function deleteRawWord(
  input: string,
  parsed: UnifiedTextResult,
  word: { start: number; end: number },
): DeleteTextCardResult {
  const line = lineRangeOf(input, word.start);
  const barIndex = parsed.barSourceSpans.findIndex((range) => word.start >= range.start && word.start < range.end);
  const bar = barIndex < 0 ? undefined : parsed.barSourceSpans[barIndex]!;
  const nextLine = editLine(input, line.start, line.end, (text) => {
    if (bar !== undefined) {
      const barText = text.slice(bar.start - line.start, bar.end - line.start);
      const relative = word.start - bar.start;
      const elsewhere = barText.slice(0, relative) + barText.slice(relative + (word.end - word.start));
      if (!/[^\s|]/.test(elsewhere)) return removeBarFromLine(text, bar.start - line.start, bar.end - line.start);
    }
    const edited = text.slice(0, word.start - line.start) + text.slice(word.end - line.start);
    return cleanupLine(edited);
  });
  return { text: nextLine, removed: nextLine !== input };
}

function lineRangeOf(text: string, offset: number): { start: number; end: number } {
  const start = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  const end = text.indexOf("\n", offset);
  return { start, end: end < 0 ? text.length : end };
}

/** Apply an edit to one raw line; drop the whole line (and one newline) when nothing but `|` and spaces is left. */
function editLine(
  input: string,
  lineStart: number,
  lineEnd: number,
  edit: (line: string) => string,
): string {
  const next = edit(input.slice(lineStart, lineEnd));
  if (/[^\s|]/.test(next)) return input.slice(0, lineStart) + next + input.slice(lineEnd);
  const before = input.slice(0, lineStart);
  const after = input.slice(lineEnd);
  if (after.startsWith("\r\n")) return before + after.slice(2);
  if (after.startsWith("\n")) return before + after.slice(1);
  if (before.endsWith("\r\n")) return before.slice(0, -2);
  if (before.endsWith("\n")) return before.slice(0, -1);
  return "";
}

function removeBarFromLine(line: string, barStart: number, barEnd: number): string {
  const left = line.lastIndexOf("|", Math.max(0, barStart - 1));
  const right = line.indexOf("|", Math.min(line.length, barEnd));
  if (left >= 0 && right >= 0) return cleanupLine(line.slice(0, left + 1) + line.slice(right + 1));
  if (left >= 0) return cleanupLine(line.slice(0, left + 1));
  if (right >= 0) return cleanupLine(line.slice(right + 1).trimStart());
  return "";
}

function cleanupLine(line: string): string {
  return line.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/, "");
}
