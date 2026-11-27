import type { ChordSymbol } from "./types";
import { EXTENDED_TEXT_LIMITS } from "./extendedTextBudgets";

/**
 * P24-06: writing the chords 「鍵盤で入れる」 adds back as the score text.
 *
 * The person picks a length (1 bar, 2 beats or 1 beat) for each chord/rest. Chords go into the bar that is
 * not full yet; a full bar is appended to the input text. A bar whose slots all have the same length is
 * written as plain names (`| Cmaj7 Am7 |`); a bar with mixed lengths is written in 1-beat cells, a held
 * beat as `=` (`| Cmaj7 = Am7 Fmaj7 |`). Rests are `_` in every cell (a rest cannot be held with `=`).
 */
export interface KeyboardSlot {
  readonly kind: "chord" | "rest";
  /** Length in beats (1, 2 or the whole bar). */
  readonly beats: number;
  readonly chord?: ChordSymbol;
  readonly notes?: readonly number[];
}

export interface KeyboardBar {
  readonly slots: readonly KeyboardSlot[];
  /** The beats already filled in this bar. */
  readonly filled: number;
}

export interface KeyboardBarResult {
  readonly bar: KeyboardBar;
  /** Set when the slot filled the bar: the tokens to append, and the chord slots' notes in order. */
  readonly completed?: {
    readonly tokens: string;
    readonly chords: readonly (readonly number[])[];
  };
}

export interface KeyboardFlush {
  readonly tokens: string;
  readonly chords: readonly (readonly number[])[];
}

export function emptyKeyboardBar(): KeyboardBar {
  return { slots: [], filled: 0 };
}

/** Adds one slot; a slot that would overflow the bar is refused (the caller disables that length). */
export function addKeyboardSlot(bar: KeyboardBar, slot: KeyboardSlot, beatsPerBar: number): KeyboardBarResult {
  if (!Number.isFinite(slot.beats) || slot.beats <= 0) return { bar };
  const remaining = beatsPerBar - bar.filled;
  if (slot.beats > remaining) return { bar };
  const next: KeyboardBar = { slots: [...bar.slots, slot], filled: bar.filled + slot.beats };
  if (next.filled !== beatsPerBar) return { bar: next };
  return {
    bar: next,
    completed: {
      tokens: keyboardBarTokens(next.slots, beatsPerBar),
      chords: next.slots.filter((entry) => entry.kind === "chord").map((entry) => entry.notes ?? []),
    },
  };
}

/** The tokens of a complete bar: names when every slot has the same length, 1-beat cells when mixed. */
export function keyboardBarTokens(slots: readonly KeyboardSlot[], beatsPerBar: number): string {
  if (slots.length === 0) return "";
  // A rest is always written per beat (`_` for every held beat), so any rest makes the bar a cell bar.
  const sameLength = slots.every((slot) => slot.kind === "chord") && slots.every((slot) => slot.beats === slots[0]!.beats);
  if (sameLength) {
    return slots.map((slot) => (slot.kind === "rest" ? "_" : written(slot))).join(" ");
  }
  return cells(slots, beatsPerBar).join(" ");
}

/**
 * Fills the rest of a bar before the keyboard is closed or the Vault is saved: the remaining beats extend
 * the last chord with `=`, or are `_` when the last slot is a rest.
 */
export function flushKeyboardBar(bar: KeyboardBar, beatsPerBar: number): KeyboardFlush | undefined {
  if (bar.slots.length === 0) return undefined;
  const body = cells(bar.slots, beatsPerBar);
  const remaining = beatsPerBar - bar.filled;
  if (remaining > 0) {
    const last = bar.slots[bar.slots.length - 1]!;
    body.push(...Array.from({ length: remaining }, () => (last.kind === "rest" ? "_" : "=")));
  }
  return {
    tokens: body.join(" "),
    chords: bar.slots.filter((entry) => entry.kind === "chord").map((entry) => entry.notes ?? []),
  };
}

/** Appends one bar's tokens to the typed text: 4 bars per line, each line starting with `| `. */
export function appendKeyboardBar(text: string, tokens: string): string {
  const trimmedEnd = text.replace(/[ \t]+$/g, "");
  if (trimmedEnd.trim() === "") return `| ${tokens} |`;
  const lines = trimmedEnd.split("\n");
  const last = lines[lines.length - 1] ?? "";
  if (!last.trim().endsWith("|")) return `${trimmedEnd}\n| ${tokens} |`;
  const barsInLine = Math.max(0, (last.match(/\|/g)?.length ?? 0) - 1);
  if (barsInLine >= 4) return `${trimmedEnd}\n| ${tokens} |`;
  const head = last.replace(/\|\s*$/, "").trimEnd();
  lines[lines.length - 1] = `${head} | ${tokens} |`;
  return lines.join("\n");
}

/** The faint line shown after the text while a bar is still open (the chords are not in the text yet). */
export function pendingKeyboardBarText(bar: KeyboardBar, beatsPerBar: number): string | undefined {
  if (bar.slots.length === 0) return undefined;
  const body = bar.slots
    .flatMap((slot) => (slot.kind === "rest" ? Array.from({ length: slot.beats }, () => "_") : [written(slot)]))
    .join(" ");
  void beatsPerBar;
  return `| ${body} …`;
}

/** The one-chord-per-beat cells of a bar (a held beat is `=`; a rest fills every beat with `_`). */
function cells(slots: readonly KeyboardSlot[], beatsPerBar: number): string[] {
  const out: string[] = [];
  for (const slot of slots) {
    if (slot.kind === "rest") {
      out.push(...Array.from({ length: slot.beats }, () => "_"));
      continue;
    }
    out.push(written(slot));
    out.push(...Array.from({ length: Math.max(0, slot.beats - 1) }, () => "="));
  }
  out.length = Math.min(out.length, beatsPerBar);
  return out;
}

function written(slot: KeyboardSlot): string {
  return slot.chord?.label ?? "";
}

/** P24-06: the lengths the design offers, as beat counts (the bar's owns the meter). */
export function keyboardLengthInBeats(length: 1 | 2 | "bar", beatsPerBar: number): number {
  return length === "bar" ? beatsPerBar : length;
}

/** The input budget guards the appended text (the one grammar's 65,536 characters). */
export function keyboardTextFits(text: string, addition: string): boolean {
  return text.length + addition.length + 4 <= EXTENDED_TEXT_LIMITS.maxInputCodeUnits;
}

/** P25 V26-3: one chord/rest of the bar before, as the preview's cards read it (a `=` holds the one before it). */
export interface PreviousBarItem {
  readonly start: number;
  readonly beats: number;
}

/** The slots of the last bar in the text, merged the way the cards are (an attack, a repeat or a rest starts one; a hold lengthens it). */
export function previousBarItems(slots: readonly { readonly bar: number; readonly startBeat: number; readonly durationBeats: number; readonly kind: string }[]): readonly PreviousBarItem[] {
  const last = slots.length === 0 ? 0 : slots[slots.length - 1]!.bar;
  const items: { start: number; beats: number }[] = [];
  for (const slot of slots) {
    if (slot.bar !== last) continue;
    const previous = items[items.length - 1];
    if (slot.kind === "hold" && previous !== undefined) previous.beats += slot.durationBeats;
    else items.push({ start: slot.startBeat - 1, beats: slot.durationBeats });
  }
  return items;
}

/**
 * P25 V26-3: the length the 「次のコード」 palette starts with: the bar before decides, beat by beat. The chord of the
 * bar before that starts at the open bar's `filled` beat gives the length (the longest of the bar / 2 beats / 1 beat that
 * is not longer and still fits); where none starts there, `current` stays (shrunk when it no longer fits).
 */
export function followedSuggestionBeats(items: readonly PreviousBarItem[], beatsPerBar: number, filled: number, current: number): number {
  const remaining = beatsPerBar - filled;
  const allowed = [...new Set([beatsPerBar, 2, 1])].filter((beats) => beats <= beatsPerBar).sort((a, b) => b - a);
  if (items.length === 0) return filled === 0 ? beatsPerBar : Math.min(current, remaining);
  const item = items.find((entry) => Math.abs(entry.start - filled) < 1e-6);
  const wanted = Math.min(item === undefined ? current : item.beats, remaining);
  return allowed.find((beats) => beats <= wanted + 1e-6) ?? 1;
}
