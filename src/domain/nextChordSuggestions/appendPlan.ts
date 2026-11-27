/**
 * P25 V23 Stage 1: appending the palette's bar to the typed text (proposal v4 §5, v3 §6).
 *
 * The addition never rewrites an existing bar: the new bar becomes one whole bar at the end of the last code
 * line (a new line after a lyric-chord line, the same separator after a comma/dash/space line, a new `| … |`
 * after a standard line). The rebuilt text is parsed again and accepted only when the five checks of v4 §5.3
 * hold (for a palette bar with several 2-beat chords, the added attacks are the bar's chord count and their
 * lengths add up to one bar, per v4 change 8); otherwise the input is left alone and the caller shows nothing.
 */
import { chordIdentityKey, normalizeChordSymbol } from "../chordIdentity";
import { parseExtendedTextChordLabel } from "../extendedTextProgression";
import { textAttackPlacements } from "../textAttackSplits";
import { asExtendedTextResult, parseUnifiedText, type UnifiedTextOptions, type UnifiedTextResult } from "../textUnified";
import type { ChordSymbol } from "../types";

export interface AppendPlan {
  readonly nextText: string;
  readonly chord: ChordSymbol;
}

export interface AppendTokensPlan {
  readonly nextText: string;
  readonly chords: readonly ChordSymbol[];
}

function identity(chord: ChordSymbol): string {
  return chordIdentityKey(normalizeChordSymbol(chord));
}

function newlineOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** Builds the candidate next text without touching any earlier line. */
function buildNextText(unified: UnifiedTextResult, body: string, forceNewLine: boolean): string | undefined {
  const lastCode = [...unified.normalized.lines].reverse().find((line) => line.kind === "code");
  if (!lastCode) return undefined;
  const newline = newlineOf(unified.source);
  const lines = unified.source.split(/\r?\n/);
  const index = lastCode.line - 1;
  if (index < 0 || index >= lines.length) return undefined;
  const raw = lines[index]!;
  const next = [...lines];
  const lyric = unified.normalized.lyricChordLines.some((line) => line.line === lastCode.line);
  const separated = unified.normalized.separatedLines.some((line) => line.line === lastCode.line);
  if (forceNewLine || lyric) {
    next.splice(index + 1, 0, `| ${body} |`);
  } else if (separated) {
    const separator = raw.includes(",") ? ", " : raw.includes("、") ? "、" : raw.includes("-") ? "-" : " ";
    next[index] = `${raw.replace(/\s+$/, "")}${separator}${body}`;
  } else {
    const trimmed = raw.replace(/\s+$/, "");
    next[index] = trimmed.endsWith("|") ? `${trimmed} ${body} |` : `${trimmed} | ${body} |`;
  }
  return next.join(newline);
}

function countMarkers(unified: UnifiedTextResult): number {
  return unified.normalized.lines.filter((line) => line.raw.trim() === ">").length;
}

/** v4 §5.3 (with change 8's multi-chord bar): the rebuilt text is accepted only when every check holds. */
function accepts(before: UnifiedTextResult, after: UnifiedTextResult, labels: readonly ChordSymbol[], beatsPerBar: number): boolean {
  if (!after.canConvert) return false;
  const beforePlacements = textAttackPlacements(asExtendedTextResult(before).harmonicSpans);
  const afterPlacements = textAttackPlacements(asExtendedTextResult(after).harmonicSpans);
  if (afterPlacements.length !== beforePlacements.length + labels.length) return false;
  for (let index = 0; index < beforePlacements.length; index += 1) {
    const a = beforePlacements[index]!;
    const b = afterPlacements[index]!;
    if (Math.abs(a.beat - b.beat) > 1e-6 || Math.abs(a.durationBeats - b.durationBeats) > 1e-6) return false;
    if (a.spanStart !== b.spanStart || identity(a.chord) !== identity(b.chord)) return false;
  }
  let total = 0;
  for (let index = 0; index < labels.length; index += 1) {
    const added = afterPlacements[beforePlacements.length + index]!;
    if (identity(added.chord) !== identity(labels[index]!)) return false;
    total += added.durationBeats;
  }
  if (Math.abs(total - beatsPerBar) > 1e-6) return false;
  if (after.bars.length !== before.bars.length + 1) return false;
  if (countMarkers(after) !== countMarkers(before)) return false;
  return true;
}

/** The one way a palette bar is added: `body` is the bar's tokens (`Dm7 Am7`, `Cmaj7 = = =`, …). */
export function planAppendTokens(input: string, body: string, options: UnifiedTextOptions = {}): AppendTokensPlan | null {
  const tokens = body.trim().split(/\s+/).filter((token) => token !== "" && token !== "=" && token !== "_");
  if (tokens.length === 0) return null;
  const chords: ChordSymbol[] = [];
  for (const token of tokens) {
    const chord = parseExtendedTextChordLabel(token);
    if (!chord) return null;
    chords.push({ ...chord, label: token });
  }
  const unified = parseUnifiedText(input, options);
  if (!unified.canConvert || unified.spans.length === 0) return null;
  const attempt = (forceNewLine: boolean) => {
    const nextText = buildNextText(unified, body.trim(), forceNewLine);
    if (nextText === undefined || nextText === input) return undefined;
    const nextUnified = parseUnifiedText(nextText, options);
    return accepts(unified, nextUnified, chords, unified.beatsPerBar) ? { nextText, chords } : undefined;
  };
  return attempt(false) ?? attempt(true) ?? null;
}

/** The single-chord form (kept for the one-chord callers and its tests). */
export function planAppendNextChord(input: string, label: string, options: UnifiedTextOptions = {}): AppendPlan | null {
  const plan = planAppendTokens(input, label, options);
  return plan === null ? null : { nextText: plan.nextText, chord: plan.chords[0]! };
}
