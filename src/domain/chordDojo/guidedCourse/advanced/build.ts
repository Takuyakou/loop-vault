import { symbol } from "../../recipes";
import type { ChordQuality } from "../../../types";
import { buildPracticeChordRequirements } from "../../../practice/chordRequirements";
import type { AdvancedChord, AdvancedCourseLevel, AdvancedItem, AdvancedItemKind, AdvancedPrompt } from "./types";
import type { AdvancedBlock, ProgressionFamily } from "./levels";

/**
 * Authored-material builders for the P23-45 advanced course. Every chord's answer rule comes from the
 * product's existing practice-leniency contract (`buildPracticeChordRequirements(..., "normal")`), so
 * extended chords require their characteristic tone (9/13/sus) without demanding an optional fifth or
 * eleventh. Only the rootless vocabulary overrides the required set, and it keeps every chord tone
 * allowed so a different valid placement still passes.
 */
export const NOTE_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "F#", "G", "A♭", "A", "B♭", "B"] as const;

const QUALITY_LABEL: Readonly<Record<string, string>> = {
  maj: "",
  min: "m",
  dim: "dim",
  aug: "+",
  maj7: "maj7",
  min7: "m7",
  dom7: "7",
  min7b5: "m7♭5",
  dim7: "dim7",
  maj9: "maj9",
  min9: "m9",
  dom9: "9",
  min11: "m11",
  dom13: "13",
  sus2: "sus2",
  sus4: "sus4",
  dom7sus4: "7sus4",
  add9: "add9",
  add13: "add13",
  six: "6",
  min6: "m6",
  sixNine: "6/9",
  minMaj7: "m(maj7)",
  power: "5",
  dom11: "11",
};

export const pc = (note: number): number => ((Math.trunc(note) % 12) + 12) % 12;

export function chordLabel(root: number, quality: ChordQuality, bass?: number): string {
  const suffix = QUALITY_LABEL[quality] ?? quality;
  return `${NOTE_NAMES[pc(root)]}${suffix}${bass === undefined ? "" : `/${NOTE_NAMES[pc(bass)]}`}`;
}

export interface ChordSpec {
  readonly root: number;
  readonly quality: ChordQuality;
  /** Lowest sounding pitch class, checked by the judge (`C/E`). */
  readonly bass?: number;
  /** P23-54: how the slash bass is spelled when the default name is wrong for the key (G# not A♭). */
  readonly bassName?: string;
  /** Force a root-position bass check even without a slash (ear questions). */
  readonly checkBass?: boolean;
  /** Rootless vocabulary: the root may be omitted and is not required. */
  readonly rootless?: boolean;
  readonly requiredPitchClasses?: readonly number[];
  readonly allowedPitchClasses?: readonly number[];
  readonly referenceNotes?: readonly number[];
}

function defaultReference(root: number, pcs: readonly number[], bass: number | undefined): number[] {
  const upper = pcs.filter((pitchClass) => pitchClass !== bass || bass === undefined).map((pitchClass) => 60 + pitchClass);
  const bottom = bass === undefined ? (pcs.includes(pc(root)) ? [] : [48 + pc(root)]) : [36 + pc(bass)];
  return [...new Set([...bottom, ...(bass === undefined ? [48 + pc(root)] : []), ...upper])].sort((left, right) => left - right);
}

export function makeChord(spec: ChordSpec): AdvancedChord {
  const requirements = buildPracticeChordRequirements(symbol(spec.root, spec.quality), "normal");
  const all = requirements.allowedPitchClasses;
  const rootPc = pc(spec.root);
  const required = spec.rootless
    ? requirements.requiredPitchClasses.filter((pitchClass) => pitchClass !== rootPc)
    : (spec.requiredPitchClasses ?? requirements.requiredPitchClasses);
  const allowed = spec.allowedPitchClasses ?? all;
  const bass = spec.bass ?? (spec.checkBass === true ? rootPc : undefined);
  const referencePcs = spec.rootless
    ? all.filter((pitchClass) => pitchClass !== rootPc)
    : all;
  return {
    root: rootPc,
    quality: spec.quality,
    label: spec.rootless
      ? `${chordLabel(spec.root, spec.quality)}（ルートレス）`
      : spec.bass !== undefined && spec.bassName !== undefined
        ? `${chordLabel(spec.root, spec.quality)}/${spec.bassName}`
        : chordLabel(spec.root, spec.quality, spec.bass),
    ...(bass === undefined ? {} : { bassPitchClass: pc(bass) }),
    requiredPitchClasses: [...required].sort((left, right) => left - right),
    allowedPitchClasses: [...allowed].sort((left, right) => left - right),
    referenceNotes: spec.referenceNotes === undefined
      ? (spec.rootless
        ? referencePcs.map((pitchClass) => 60 + pitchClass).sort((left, right) => left - right)
        : defaultReference(spec.root, referencePcs, bass))
      : [...spec.referenceNotes],
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* P23-54: the example sounds of a progression move to the nearest placement.                      */
/* ---------------------------------------------------------------------------------------------- */

/** The upper voices of an example start no lower than E3 and end no higher than A5. */
const UPPER_LOW = 52;
const UPPER_HIGH = 81;

function splitBass(notes: readonly number[]): { readonly bass: number | undefined; readonly upper: readonly number[] } {
  const sorted = [...notes].sort((left, right) => left - right);
  // Every built example keeps its bass below C4 and its upper voices from C4; a rootless chord has no bass.
  if (sorted.length > 1 && sorted[0]! < 60) return { bass: sorted[0], upper: sorted.slice(1) };
  return { bass: undefined, upper: sorted };
}

function closeVoicings(pitchClasses: readonly number[]): number[][] {
  const pcs = [...new Set(pitchClasses.map(pc))].sort((left, right) => left - right);
  const result: number[][] = [];
  for (let start = 0; start < pcs.length; start += 1) {
    const order = [...pcs.slice(start), ...pcs.slice(0, start)];
    for (let lowest = UPPER_LOW; lowest < UPPER_LOW + 12; lowest += 1) {
      if (pc(lowest) !== order[0]) continue;
      const notes = [lowest];
      for (const next of order.slice(1)) {
        let note = notes[notes.length - 1]! + 1;
        while (pc(note) !== next) note += 1;
        notes.push(note);
      }
      if (notes[notes.length - 1]! <= UPPER_HIGH) result.push(notes);
    }
  }
  return result;
}

function distance(from: readonly number[], to: readonly number[]): number {
  const nearest = (note: number, others: readonly number[]) => Math.min(...others.map((other) => Math.abs(other - note)));
  return from.reduce((sum, note) => sum + nearest(note, to), 0) + to.reduce((sum, note) => sum + nearest(note, from), 0);
}

const mean = (notes: readonly number[]) => notes.reduce((sum, note) => sum + note, 0) / notes.length;

/**
 * The example notes of each chord after the first move to the close placement nearest the chord before
 * (common tones stay, the others move by the smallest step). The bass stays the lowest note and moves to
 * whichever octave is nearer the previous bass. Only the example changes: pitch classes, the slash bass
 * and the answer rule are untouched, so any placement the learner chooses is judged exactly as before.
 */
export function voiceLed(chords: readonly AdvancedChord[]): AdvancedChord[] {
  const result: AdvancedChord[] = [];
  let previous: { bass: number | undefined; upper: readonly number[] } | undefined;
  for (const chord of chords) {
    const own = splitBass(chord.referenceNotes);
    if (previous === undefined) {
      result.push(chord);
      previous = own;
      continue;
    }
    const before = previous;
    const candidates = closeVoicings(own.upper);
    const upper = candidates.length === 0 ? [...own.upper] : candidates.reduce((best, candidate) => {
      const gap = distance(candidate, before.upper) - distance(best, before.upper);
      if (gap !== 0) return gap < 0 ? candidate : best;
      const centre = Math.abs(mean(candidate) - mean(before.upper)) - Math.abs(mean(best) - mean(before.upper));
      if (centre !== 0) return centre < 0 ? candidate : best;
      return candidate[0]! < best[0]! ? candidate : best;
    });
    let bass: number | undefined;
    if (own.bass !== undefined) {
      const options = [36 + pc(own.bass), 48 + pc(own.bass)].filter((note) => note < upper[0]!);
      const target = before.bass ?? own.bass;
      bass = options.reduce((best, note) => (Math.abs(note - target) < Math.abs(best - target) ? note : best), options[options.length - 1]!);
    }
    const notes = bass === undefined ? upper : [bass, ...upper];
    result.push({ ...chord, referenceNotes: notes });
    previous = { bass, upper };
  }
  return result;
}

/** Which mode an ear question's reference cadence is in. */
export type KeyMode = "major" | "minor";

/**
 * The cadence played before an ear question: I → V → I in major, i → V7 → i in minor (the harmonic-minor
 * dominant), so the tonic the learner hears is the tonic of the progression that follows.
 */
export function keyCadence(key: number, mode: KeyMode = "major"): AdvancedChord[] {
  return voiceLed(mode === "minor"
    ? [makeChord({ root: key, quality: "min" }), makeChord({ root: key + 7, quality: "dom7" }), makeChord({ root: key, quality: "min" })]
    : [makeChord({ root: key, quality: "maj" }), makeChord({ root: key + 7, quality: "maj" }), makeChord({ root: key, quality: "maj" })]);
}

export interface ItemSpec {
  readonly id: string;
  readonly level: AdvancedCourseLevel;
  readonly block: AdvancedBlock;
  readonly setId: string;
  readonly kind: AdvancedItemKind;
  readonly part?: string;
  readonly group?: string;
  readonly family?: ProgressionFamily;
  readonly prompt?: AdvancedPrompt;
  readonly label: string;
  readonly detail?: string;
  readonly keyRoot?: number;
  readonly chords: readonly AdvancedChord[];
  readonly referenceChords?: readonly AdvancedChord[];
  readonly plainChords?: readonly AdvancedChord[];
  readonly startIndex?: number;
  readonly revealCards?: boolean;
  readonly tempoBpm?: number;
  readonly allowedPlaybacks?: number;
}

export function makeItem(spec: ItemSpec): AdvancedItem {
  const prompt = spec.prompt ?? "name";
  return {
    id: spec.id,
    level: spec.level,
    block: spec.block,
    setId: spec.setId,
    kind: spec.kind,
    ...(spec.part === undefined ? {} : { part: spec.part }),
    ...(spec.group === undefined ? {} : { group: spec.group }),
    ...(spec.family === undefined ? {} : { family: spec.family }),
    prompt,
    label: spec.label,
    ...(spec.detail === undefined ? {} : { detail: spec.detail }),
    ...(spec.keyRoot === undefined ? {} : { keyRoot: pc(spec.keyRoot) }),
    chords: [...spec.chords],
    ...(spec.referenceChords === undefined ? {} : { referenceChords: [...spec.referenceChords] }),
    ...(spec.plainChords === undefined ? {} : { plainChords: [...spec.plainChords] }),
    ...(spec.startIndex === undefined ? {} : { startIndex: spec.startIndex }),
    revealCards: spec.revealCards ?? prompt === "name",
    ...(spec.tempoBpm === undefined ? {} : { tempoBpm: spec.tempoBpm }),
    allowedPlaybacks: spec.allowedPlaybacks ?? (prompt === "ear" ? 2 : 0),
  };
}

/** The six P23-45 progression families, written as root offsets and qualities from the key root. */
interface FamilyStep {
  readonly offset: number;
  readonly quality: ChordQuality;
}

export const FAMILY_STEPS: Readonly<Record<ProgressionFamily, readonly FamilyStep[]>> = {
  "major-ii-v-i": [
    { offset: 2, quality: "min7" },
    { offset: 7, quality: "dom7" },
    { offset: 0, quality: "maj7" },
  ],
  "minor-ii-v-i": [
    { offset: 2, quality: "min7b5" },
    { offset: 7, quality: "dom7" },
    { offset: 0, quality: "min7" },
  ],
  "i-vi7-ii-v": [
    { offset: 0, quality: "maj7" },
    { offset: 9, quality: "dom7" },
    { offset: 2, quality: "min7" },
    { offset: 7, quality: "dom7" },
  ],
  "i-v-vi-iv": [
    { offset: 0, quality: "maj" },
    { offset: 7, quality: "maj" },
    { offset: 9, quality: "min7" },
    { offset: 5, quality: "maj7" },
  ],
  "iv-iii7-vi": [
    { offset: 5, quality: "maj7" },
    { offset: 4, quality: "dom7" },
    { offset: 9, quality: "min7" },
  ],
  "iv-iii-ii-i": [
    { offset: 5, quality: "maj7" },
    { offset: 4, quality: "min7" },
    { offset: 2, quality: "min7" },
    { offset: 0, quality: "maj7" },
  ],
};

export const FAMILY_LENGTH: Readonly<Record<ProgressionFamily, number>> = {
  "major-ii-v-i": 3,
  "minor-ii-v-i": 3,
  "i-vi7-ii-v": 4,
  "i-v-vi-iv": 4,
  "iv-iii7-vi": 3,
  "iv-iii-ii-i": 4,
};

export function familyChords(family: ProgressionFamily, keyRoot: number, options: { readonly checkBass?: boolean } = {}): AdvancedChord[] {
  return voiceLed(FAMILY_STEPS[family].map((step) => makeChord({
    root: keyRoot + step.offset,
    quality: step.quality,
    ...(options.checkBass === true ? { checkBass: true } : {}),
  })));
}

/** P23-54: the key of every family is named by its tonic; only the minor ii–V–i is heard in minor. */
export const FAMILY_MODE: Readonly<Record<ProgressionFamily, KeyMode>> = {
  "major-ii-v-i": "major",
  "minor-ii-v-i": "minor",
  "i-vi7-ii-v": "major",
  "i-v-vi-iv": "major",
  "iv-iii7-vi": "major",
  "iv-iii-ii-i": "major",
};

export function familyProgressionLabel(family: ProgressionFamily, keyRoot: number): string {
  return familyChords(family, keyRoot).map((chord) => chord.label).join(" → ");
}
