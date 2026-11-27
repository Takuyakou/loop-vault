/**
 * P25-03 C: the sound of one text-intake card — the K shapes, the hand-edited notes and the pure
 * inversion / height / approach-previous moves the dock offers. No React, no audio.
 */
import type { ChordSymbol, VoicingSnapshot } from "./types";
import { normalizedChordKey } from "./voicing/normalizeVoicing";
import { textPreviewNotes } from "./textVoicingAvailability";
import {
  buildShapeVoicing, DEFAULT_GENERATED_SHAPE_OPTIONS, pickShapeForm, placementNotes, recChordOf,
  type GeneratedShapeOptions, type ShapeVoicingResult, type VoicingShapeOptions,
} from "./voicingShapes";
import { SEMI } from "./voicingShapes/recipe";
import { formatShapeExtractorVersion, parseShapeExtractorVersion, shapeOfLegacyTextStyle, TEXT_SHAPE_EXTRACTOR_PREFIX, type LegacyTextStyleId } from "./voicingShapes/shapeIds";

/** The dock keyboard's range (MIDI 36–84 = C3–C7 in the app's notation). */
export const CARD_KEY_LOW = 36;
export const CARD_KEY_HIGH = 84;
export const CARD_MIN_NOTES = 2;
export const CARD_MAX_NOTES = 10;

export const TEXT_HAND_EXTRACTOR_VERSION = "text-hand-v1";
const TEXT_STYLE_PREFIX = "text-style-v1:";

const mod12 = (n: number): number => ((n % 12) + 12) % 12;
const sorted = (notes: readonly number[]): number[] => [...notes].sort((a, b) => a - b);

/** K9-3: the basic check for notes made by K, by hand or played (2–10 integers 0–127, no repeated pitch). */
export function basicNotesValid(notes: readonly number[]): boolean {
  return notes.length >= CARD_MIN_NOTES && notes.length <= CARD_MAX_NOTES
    && notes.every((note) => Number.isInteger(note) && note >= 0 && note <= 127)
    && new Set(notes).size === notes.length;
}

/** The K3 static choice of a shape for one card (the ② order picks the form; an unplaceable order uses the other). */
export function cardShapeNotes(chord: ChordSymbol, options: VoicingShapeOptions): { readonly notes: number[]; readonly result: ShapeVoicingResult; readonly form: "A" | "B" | null } | undefined {
  const result = buildShapeVoicing(chord, options);
  const form = pickShapeForm(result, options.rootlessOrder);
  if (!form) return undefined;
  const notes = placementNotes(form.staticChoice);
  return basicNotesValid(notes) ? { notes, result, form: form.form } : undefined;
}

/** 基本: the card's sound when it has nothing of its own — today's recommended text sound (`generated-close`). */
export function defaultCardNotes(chord: ChordSymbol): number[] {
  return [...textPreviewNotes(chord)];
}

function snapshotOf(chord: ChordSymbol, notes: readonly number[], extractorVersion: string): VoicingSnapshot {
  const midiNotes = sorted(notes);
  return {
    schemaVersion: 1,
    source: "manual",
    representation: "simultaneous-voicing",
    midiNotes,
    bassNote: midiNotes[0],
    capturedForChordKey: normalizedChordKey(chord),
    capturedForChordLabel: chord.label,
    confidence: 1,
    userVerified: true,
    extractorVersion,
  };
}

/** K7 / C4: the card's shape snapshot (`text-shape-v1:…`). The ② form actually used is written. */
export function createTextShapeSnapshot(chord: ChordSymbol, options: VoicingShapeOptions): VoicingSnapshot | undefined {
  const made = cardShapeNotes(chord, options);
  if (!made) return undefined;
  return snapshotOf(chord, made.notes, formatShapeExtractorVersion(options, made.form));
}

/** C11: notes changed by hand (`text-hand-v1`). */
export function createTextHandSnapshot(chord: ChordSymbol, notes: readonly number[]): VoicingSnapshot | undefined {
  return basicNotesValid(notes) ? snapshotOf(chord, notes, TEXT_HAND_EXTRACTOR_VERSION) : undefined;
}

export type CardSoundKind = "shape" | "hand" | "live";

export function cardSoundKindOf(snapshot: VoicingSnapshot | undefined): CardSoundKind | undefined {
  if (!snapshot) return undefined;
  if (snapshot.source === "live-played") return "live";
  if (snapshot.source !== "manual") return undefined;
  if (snapshot.extractorVersion === TEXT_HAND_EXTRACTOR_VERSION) return "hand";
  if (snapshot.extractorVersion?.startsWith(TEXT_SHAPE_EXTRACTOR_PREFIX) || snapshot.extractorVersion?.startsWith(TEXT_STYLE_PREFIX)) return "shape";
  return undefined;
}

export interface CardShapeMark {
  /** The choice the buttons mark (基本 when the card has no shape snapshot of its own). */
  readonly options: GeneratedShapeOptions;
  /** True for an old `text-style-v1:` snapshot: its saved notes play as they are. */
  readonly legacy: boolean;
}

/** C4 / K7: which shape button a card marks. A card with no shape snapshot marks 基本. */
export function cardShapeMarkOf(snapshot: VoicingSnapshot | undefined, chord: ChordSymbol): CardShapeMark {
  if (!snapshot || cardSoundKindOf(snapshot) !== "shape") return { options: DEFAULT_GENERATED_SHAPE_OPTIONS, legacy: false };
  const parsed = parseShapeExtractorVersion(snapshot.extractorVersion);
  if (parsed) return { options: parsed, legacy: false };
  const style = snapshot.extractorVersion!.slice(TEXT_STYLE_PREFIX.length) as LegacyTextStyleId;
  const options = ["generated-close", "shell-17", "open-17", "rootless-ab"].includes(style)
    ? shapeOfLegacyTextStyle(style, chord, snapshot.midiNotes) : DEFAULT_GENERATED_SHAPE_OPTIONS;
  return { options, legacy: true };
}

// ---- C4: inversion, height, approach the previous card ----

/** The pitch class the bass stays on: the slash bass, else the root. */
function bassPitchClass(chord: ChordSymbol): number {
  return mod12(chord.bass ?? chord.root);
}

/** C4「ベースあり」: 3+ notes whose lowest note is the chord's bass. */
export function hasFixedBass(notes: readonly number[], chord: ChordSymbol): boolean {
  const n = sorted(notes);
  return n.length >= 3 && mod12(n[0]!) === bassPitchClass(chord);
}

function split(notes: readonly number[], chord: ChordSymbol): { readonly bass?: number; readonly upper: number[] } {
  const n = sorted(notes);
  return hasFixedBass(n, chord) ? { bass: n[0]!, upper: n.slice(1) } : { upper: n };
}

function fits(note: number, bass: number | undefined, others: readonly number[]): boolean {
  return note >= CARD_KEY_LOW && note <= CARD_KEY_HIGH && (bass === undefined || note > bass) && !others.includes(note);
}

/** 転回 ↑: the lowest upper note goes up an octave. Undefined when it cannot move. */
export function invertUp(notes: readonly number[], chord: ChordSymbol): number[] | undefined {
  const { bass, upper } = split(notes, chord);
  if (upper.length === 0) return undefined;
  const moved = upper[0]! + 12;
  const rest = [...(bass === undefined ? [] : [bass]), ...upper.slice(1)];
  return fits(moved, bass, rest) ? sorted([...rest, moved]) : undefined;
}

/** 転回 ↓: the highest upper note goes down an octave. */
export function invertDown(notes: readonly number[], chord: ChordSymbol): number[] | undefined {
  const { bass, upper } = split(notes, chord);
  if (upper.length === 0) return undefined;
  const moved = upper[upper.length - 1]! - 12;
  const rest = [...(bass === undefined ? [] : [bass]), ...upper.slice(0, -1)];
  return fits(moved, bass, rest) ? sorted([...rest, moved]) : undefined;
}

/** 高さ ↓ ↑: every note an octave. */
export function shiftOctave(notes: readonly number[], direction: 1 | -1): number[] | undefined {
  const moved = notes.map((note) => note + 12 * direction);
  return moved.every((note) => note >= CARD_KEY_LOW && note <= CARD_KEY_HIGH) ? sorted(moved) : undefined;
}

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

function upperOfPrevious(previous: readonly number[]): number[] {
  const n = sorted(previous);
  return n.length >= 3 ? n.slice(1) : n;
}

/** C4「前に近づける」: the inversion whose upper notes sit closest to the previous card's. */
export function approachPrevious(notes: readonly number[], previous: readonly number[], chord: ChordSymbol): number[] | undefined {
  if (previous.length === 0 || notes.length === 0) return undefined;
  const prevUpper = upperOfPrevious(previous);
  const prevMean = mean(prevUpper); const prevTop = Math.max(...prevUpper);
  const closeness = (candidate: readonly number[]): number => {
    const { upper } = split(candidate, chord);
    const use = upper.length > 0 ? upper : sorted(candidate);
    return Math.abs(mean(use) - prevMean) + 0.5 * Math.abs(Math.max(...use) - prevTop);
  };
  const candidates: number[][] = [sorted(notes)];
  for (const step of [invertUp, invertDown]) {
    let current = sorted(notes);
    for (let i = 0; i < 6; i += 1) {
      const next = step(current, chord);
      if (!next) break;
      candidates.push(next); current = next;
    }
  }
  let best = candidates[0]!; let bestCost = closeness(best);
  for (const candidate of candidates.slice(1)) {
    const cost = closeness(candidate);
    if (cost < bestCost) { best = candidate; bestCost = cost; }
  }
  return best === candidates[0] ? undefined : best;
}

// ---- C3: what a key means for the chord ----

export type CardKeyKind = "tone" | "tension" | "other";

const TENSION_LABEL: Readonly<Record<number, string>> = { 1: "♭9", 2: "9", 3: "♯9", 5: "11", 6: "♯11", 8: "♭13", 9: "13" };

const pretty = (degree: string): string => degree.replace(/b/g, "♭").replace(/#/g, "♯");

export interface CardKeyRoles {
  readonly kindOf: (note: number) => CardKeyKind;
  /** The degree label for a tone or tension (`R` `3` `♭7` `9` …); undefined for other notes. */
  readonly degreeOf: (note: number) => string | undefined;
  /** The written chord tones (K `tones()`), as pitch classes. */
  readonly tonePitchClasses: ReadonlySet<number>;
}

export function cardKeyRoles(chord: ChordSymbol): CardKeyRoles {
  const root = mod12(chord.root);
  let degrees: string[] = ["R"];
  let colours: string[] = [];
  try {
    const c = recChordOf(chord);
    degrees = [...new Set(c.tones())];
    // K9-2 (C3, rev12): a tension is a safe colour (P26 3.1) or a written tension — not the mock's semitone table.
    colours = [...c.safe, ...c.nat, ...c.altT];
  } catch { /* unknown quality: the root only */ }
  const toneDegree = new Map<number, string>();
  for (const degree of degrees) {
    const semis = SEMI[degree];
    if (semis !== undefined && !toneDegree.has(mod12(semis))) toneDegree.set(mod12(semis), pretty(degree));
  }
  const tensionDegree = new Map<number, string>();
  for (const degree of colours) {
    const semis = SEMI[degree];
    if (semis === undefined) continue;
    const rel = mod12(semis);
    if (!toneDegree.has(rel) && !tensionDegree.has(rel)) tensionDegree.set(rel, TENSION_LABEL[rel] ?? pretty(degree));
  }
  const tonePitchClasses = new Set([...toneDegree.keys()].map((rel) => mod12(root + rel)));
  const relative = (note: number): number => mod12(note - root);
  return {
    tonePitchClasses,
    kindOf: (note) => toneDegree.has(relative(note)) ? "tone" : tensionDegree.has(relative(note)) ? "tension" : "other",
    degreeOf: (note) => toneDegree.get(relative(note)) ?? tensionDegree.get(relative(note)),
  };
}
