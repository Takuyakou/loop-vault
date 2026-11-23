import { NOTE_NAMES, pc } from "../../domain/chordDojo/guidedCourse/advanced/build";
import { advancedItemById } from "../../domain/chordDojo/guidedCourse/advanced/bank";
import { SIGHT_BEATS_PER_BAR, SIGHT_MAX_STOP_BEATS, expectedChords } from "../../domain/chordDojo/guidedCourse/advanced/judge";
import type {
  AdvancedChord,
  AdvancedCourseLevel,
  AdvancedItem,
  AdvancedTrial,
} from "../../domain/chordDojo/guidedCourse/advanced/types";

/**
 * P24-04: what went wrong in the last five questions, from the evidence the store already keeps.
 *
 * Nothing here decides pass or fail. It only picks the words of the break screen: the first wrong answer
 * of the round, the card it happened on, and the notes that were heard against the chord that was asked.
 * The rules are the design's table (P24-G); the case that decides the words is the first failing one in
 * the order below.
 */
export type AdvancedDiagnosisKind =
  | "lv4-slash-bass"
  | "lv4-progression"
  | "lv5-midstart"
  | "lv5-progression"
  | "lv6-transpose"
  | "lv7-bass"
  | "lv7-upper"
  | "lv8-tension-missing"
  | "lv8-rootless"
  | "lv8-recolor"
  | "cap-name"
  | "cap-ear"
  | "cap-sight-stop"
  | "cap-sight-accuracy"
  | "no-input"
  | "incomplete"
  | "all-correct";

export interface AdvancedDiagnosis {
  readonly kind: AdvancedDiagnosisKind;
  /** `undefined` when the words should be the level's existing one-liner (self-confirmed or unexplained). */
  readonly values?: Readonly<Record<string, string | number>>;
}

const name = (value: number): string => NOTE_NAMES[pc(value)]!;

/** The chord a question is about, at the failing card (card 1 for a single-chord item). */
function failingCard(item: AdvancedItem, trial: AdvancedTrial): { chord: AdvancedChord; index: number; notes: readonly number[] } | undefined {
  const chords = expectedChords(item);
  if (chords.length === 0) return undefined;
  const steps = trial.steps;
  const bad = steps.findIndex((step) => !step.ok);
  if (item.kind === "capstone-sight") {
    if (bad < 0) return undefined;
    const card = Math.floor(bad / SIGHT_BEATS_PER_BAR);
    return { chord: item.chords[card]!, index: card, notes: steps[bad]?.notes ?? [] };
  }
  if (chords.length === 1) return { chord: chords[0]!, index: 0, notes: trial.sealedNotes };
  if (bad < 0) return undefined;
  return { chord: chords[bad]!, index: bad, notes: steps[bad]?.notes ?? [] };
}

function lowestName(notes: readonly number[]): string | undefined {
  const sounding = notes.filter((note) => Number.isInteger(note) && note >= 0 && note <= 127);
  return sounding.length ? name(Math.min(...sounding)) : undefined;
}

function lowestPitchClass(notes: readonly number[]): number | undefined {
  const sounding = notes.filter((note) => Number.isInteger(note) && note >= 0 && note <= 127);
  return sounding.length ? pc(Math.min(...sounding)) : undefined;
}

/** The written bass when the chord names one, else the root. */
function chordBass(chord: AdvancedChord): number {
  return chord.bassPitchClass ?? chord.root;
}

function missingOf(chord: AdvancedChord, notes: readonly number[]): number[] {
  const sounded = new Set(notes.filter((note) => Number.isInteger(note)).map(pc));
  return chord.requiredPitchClasses.filter((value) => !sounded.has(value));
}

function foreignOf(chord: AdvancedChord, notes: readonly number[]): number[] {
  const sounded = [...new Set(notes.filter((note) => Number.isInteger(note)).map(pc))];
  return sounded.filter((value) => !chord.allowedPitchClasses.includes(value) && value !== chord.bassPitchClass);
}

function names(values: readonly number[]): string {
  return values.map((value) => name(value)).join("・");
}

function missingOrForeign(chord: AdvancedChord, notes: readonly number[]): string {
  const missing = missingOf(chord, notes);
  const foreign = foreignOf(chord, notes);
  if (missing.length && foreign.length) return `${names(missing)} が足りず ${names(foreign)} が余分`;
  if (missing.length) return `${names(missing)} が足りない`;
  if (foreign.length) return `${names(foreign)} が余分`;
  return "音の選び方";
}

/** The degree of the colour tone the chord asks for, when the missing note is one. */
function colourTone(chord: AdvancedChord, missing: readonly number[]): "9" | "13" | "6" | "4" | undefined {
  const quality = chord.quality;
  if (quality === "maj9" || quality === "min9" || quality === "dom9" || quality === "add9") return "9";
  if (quality === "dom13" || quality === "add13") return "13";
  if (quality === "six" || quality === "sixNine" || quality === "min6") return "6";
  if (quality === "sus2" || quality === "sus4" || quality === "dom7sus4") return "4";
  return missing.some((value) => pc(value) === pc(chord.root + 2)) ? "9" : undefined;
}

const TONE_TEXT: Record<"9" | "13" | "6" | "4", { degree: string; hint: string; colour: string }> = {
  "9": { degree: "9度", hint: "9度の音", colour: "9度" },
  "13": { degree: "13度", hint: "13度の音", colour: "13度" },
  "6": { degree: "6度", hint: "6度の音", colour: "6度" },
  "4": { degree: "4度(sus)", hint: "4度(sus)の音", colour: "4度(sus)" },
};

function commonValues(item: AdvancedItem, chord: AdvancedChord, card: { index: number; notes: readonly number[] }, trial: AdvancedTrial) {
  const missing = missingOf(chord, card.notes);
  const foreign = foreignOf(chord, card.notes);
  const tone = colourTone(chord, missing);
  return {
    label: chord.label,
    chordLabel: chord.label,
    plainLabel: item.plainChords?.[card.index]?.label ?? chord.label,
    cardNo: card.index + 1,
    missingNames: names(missing),
    missingOrForeign: missingOrForeign(chord, card.notes),
    bassName: name(chordBass(chord)),
    lowestPlayed: lowestName(card.notes) ?? "—",
    rootName: name(chord.root),
    firstRoot: name(expectedChords(item)[0]?.root ?? chord.root),
    keyName: item.keyRoot === undefined ? "—" : name(item.keyRoot),
    familyHint: item.detail ?? item.label,
    toneHint: tone ? TONE_TEXT[tone].hint : "色の音",
    tensionDegree: tone ? TONE_TEXT[tone].degree : "色の音",
    colorHint: tone ? TONE_TEXT[tone].colour : "色",
    longestStop: sightStopOf(trial, item),
    foreignNames: names(foreign),
  };
}

function sightStopOf(trial: AdvancedTrial, item: AdvancedItem): number {
  if (item.kind !== "capstone-sight") return 0;
  let longest = 0;
  let run = 0;
  for (const step of trial.steps) {
    if (step.ok) { run = 0; continue; }
    run += 1;
    longest = Math.max(longest, run);
  }
  return longest;
}

/**
 * The first wrong answer of the round, as a kind plus the words' substitutions.
 * `values === undefined` means "use the level's existing one-liner" (self-confirmed trials and cases the
 * table does not name).
 */
export function diagnoseRound(trials: readonly AdvancedTrial[], _level: AdvancedCourseLevel): AdvancedDiagnosis {
  const wrong = trials.find((trial) => trial.result !== "correct");
  if (wrong === undefined) return { kind: "all-correct", values: {} };
  // P24-04: no sound diagnosis for a self-confirmed trial, an empty answer or an invalid one.
  if (wrong.result === "no-input") return { kind: "no-input", values: {} };
  if (wrong.result === "incomplete") return { kind: "incomplete", values: {} };
  if (wrong.result === "invalid" || wrong.selfConfirmed) return { kind: "no-input", values: undefined };
  const item = advancedItemById(wrong.itemId);
  if (item === undefined) return { kind: "no-input", values: undefined };
  const card = failingCard(item, wrong);
  // A sight reading stop is a wrong answer with no notes on that beat: it still has something to say.
  if (card === undefined || (card.notes.length === 0 && item.kind !== "capstone-sight")) {
    return { kind: "no-input", values: undefined };
  }
  if (card === undefined) return { kind: "no-input", values: undefined };
  const values = commonValues(item, card.chord, card, wrong);
  const lowest = lowestPitchClass(card.notes);
  const bassWrong = lowest !== undefined && lowest !== chordBass(card.chord);
  const missing = missingOf(card.chord, card.notes);
  const tone = colourTone(card.chord, missing);
  const plain = item.plainChords !== undefined;

  switch (item.level) {
    case 4:
      if (expectedChords(item).length === 1) {
        return bassWrong ? { kind: "lv4-slash-bass", values } : { kind: "lv4-progression", values };
      }
      return { kind: "lv4-progression", values };
    case 5:
      return item.startIndex !== undefined && item.startIndex > 0
        ? { kind: "lv5-midstart", values } : { kind: "lv5-progression", values };
    case 6:
      return { kind: "lv6-transpose", values };
    case 7:
      return bassWrong ? { kind: "lv7-bass", values } : { kind: "lv7-upper", values };
    case 8:
      if (plain) return { kind: "lv8-recolor", values };
      if (tone !== undefined && !card.chord.requiredPitchClasses.includes(card.chord.root)
        && card.chord.quality !== "sus2" && card.chord.quality !== "sus4" && card.chord.quality !== "dom7sus4") {
        return { kind: "lv8-rootless", values };
      }
      if (tone !== undefined) return { kind: "lv8-tension-missing", values };
      return { kind: "lv8-rootless", values };
    default: {
      if (item.kind === "capstone-name") return { kind: "cap-name", values };
      if (item.kind === "capstone-sight") {
        return values.longestStop > SIGHT_MAX_STOP_BEATS
          ? { kind: "cap-sight-stop", values } : { kind: "cap-sight-accuracy", values };
      }
      return bassWrong ? { kind: "cap-ear", values } : { kind: "cap-ear", values };
    }
  }
}
