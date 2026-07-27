import type { VoicingRepresentation } from "../types";

export type GoldRepresentation = "simultaneous" | "aggregated" | "hybrid" | "none";

export interface VoicingNoteSetMetrics {
  exact: boolean;
  truePositive: number;
  extraNoteCount: number;
  missingNoteCount: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface VoicingRegisterMetrics {
  bassNoteCorrect: boolean;
  topNoteCorrect: boolean;
  lowestNoteAbsoluteError?: number;
  highestNoteAbsoluteError?: number;
  registerExact: boolean;
  octaveError: boolean;
}

export interface VoicingRepresentationMetrics {
  expected: VoicingRepresentation | "none";
  actual: VoicingRepresentation | "none";
  accurate: boolean;
  simultaneousMiss: boolean;
  aggregatedAsSimultaneous: boolean;
}

export function voicingNoteSetMetrics(
  predictedNotes: readonly number[],
  goldNotes: readonly number[],
): VoicingNoteSetMetrics {
  const predicted = uniqueSorted(predictedNotes);
  const gold = uniqueSorted(goldNotes);
  const goldSet = new Set(gold);
  const predictedSet = new Set(predicted);
  const truePositive = predicted.filter((note) => goldSet.has(note)).length;
  const extraNoteCount = predicted.filter((note) => !goldSet.has(note)).length;
  const missingNoteCount = gold.filter((note) => !predictedSet.has(note)).length;
  const precision = predicted.length === 0 ? (gold.length === 0 ? 1 : 0) : truePositive / predicted.length;
  const recall = gold.length === 0 ? (predicted.length === 0 ? 1 : 0) : truePositive / gold.length;
  return {
    exact: extraNoteCount === 0 && missingNoteCount === 0,
    truePositive,
    extraNoteCount,
    missingNoteCount,
    precision,
    recall,
    f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
  };
}

export function voicingRegisterMetrics(
  predictedNotes: readonly number[],
  goldNotes: readonly number[],
): VoicingRegisterMetrics {
  const predicted = uniqueSorted(predictedNotes);
  const gold = uniqueSorted(goldNotes);
  if (predicted.length === 0 || gold.length === 0) {
    const bothEmpty = predicted.length === 0 && gold.length === 0;
    return {
      bassNoteCorrect: bothEmpty,
      topNoteCorrect: bothEmpty,
      registerExact: bothEmpty,
      octaveError: false,
    };
  }
  const predictedBass = predicted[0]!;
  const predictedTop = predicted[predicted.length - 1]!;
  const goldBass = gold[0]!;
  const goldTop = gold[gold.length - 1]!;
  const lowestNoteAbsoluteError = Math.abs(predictedBass - goldBass);
  const highestNoteAbsoluteError = Math.abs(predictedTop - goldTop);
  return {
    bassNoteCorrect: predictedBass === goldBass,
    topNoteCorrect: predictedTop === goldTop,
    lowestNoteAbsoluteError,
    highestNoteAbsoluteError,
    registerExact: predictedBass === goldBass && predictedTop === goldTop,
    octaveError: isOctaveError(predictedBass, goldBass) || isOctaveError(predictedTop, goldTop),
  };
}

export function voicingRepresentationMetrics(
  actual: VoicingRepresentation | undefined,
  gold: GoldRepresentation,
): VoicingRepresentationMetrics {
  const expected = expectedRepresentation(gold);
  const normalizedActual = actual ?? "none";
  return {
    expected,
    actual: normalizedActual,
    accurate: expected === normalizedActual,
    simultaneousMiss: (gold === "simultaneous" || gold === "hybrid")
      && normalizedActual !== "simultaneous-voicing",
    aggregatedAsSimultaneous: gold === "aggregated"
      && normalizedActual === "simultaneous-voicing",
  };
}

export function leakedNotes(
  predictedNotes: readonly number[],
  goldNotes: readonly number[],
  distractorNotes: readonly number[],
): number[] {
  const gold = new Set(goldNotes);
  const distractors = new Set(distractorNotes);
  return uniqueSorted(predictedNotes).filter((note) => !gold.has(note) && distractors.has(note));
}

function expectedRepresentation(gold: GoldRepresentation): VoicingRepresentation | "none" {
  if (gold === "aggregated") return "aggregated-note-set";
  if (gold === "none") return "none";
  return "simultaneous-voicing";
}

function uniqueSorted(notes: readonly number[]): number[] {
  return [...new Set(notes)].sort((left, right) => left - right);
}

function isOctaveError(predicted: number, gold: number): boolean {
  const distance = Math.abs(predicted - gold);
  return distance > 0 && distance % 12 === 0;
}
