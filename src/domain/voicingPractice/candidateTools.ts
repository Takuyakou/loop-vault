import type { ChordSymbol } from "../types";
import {
  handSpan,
  handsDoNotCross,
  STYLE_VOICING_REGISTER,
} from "./register";
import { findLowIntervalViolation } from "./lowIntervalLimit";
import type {
  GeneratedVoicingStyleId,
  StyleVoicingWarning,
  VoicingStyleId,
} from "./types";

export interface StyleVoicingCandidate {
  styleId: GeneratedVoicingStyleId;
  leftHandNotes: number[];
  rightHandNotes: number[];
  allNotes: number[];
  variant?: string;
  requiredIntervals: string[];
  addedColorIntervals: string[];
  omittedIntervals: string[];
  warnings: StyleVoicingWarning[];
}

export interface CandidateBuildOptions {
  maxLeftHandSpanSemitones: number;
  maxRightHandSpanSemitones: number;
  requireOpenWidth?: boolean;
}

export function enumerateSplitCandidates(
  chord: ChordSymbol,
  styleId: VoicingStyleId,
  leftPitchClasses: readonly number[],
  rightPitchClasses: readonly number[],
  metadata: Omit<StyleVoicingCandidate,
    | "styleId"
    | "leftHandNotes"
    | "rightHandNotes"
    | "allNotes"
  >,
  options: CandidateBuildOptions,
): StyleVoicingCandidate[] {
  const leftPlacements = enumerateHandPlacements(
    leftPitchClasses,
    STYLE_VOICING_REGISTER.leftHandMin,
    STYLE_VOICING_REGISTER.leftHandMax,
    options.maxLeftHandSpanSemitones,
  );
  const rightPlacements = enumerateHandPlacements(
    rightPitchClasses,
    STYLE_VOICING_REGISTER.rightHandMin,
    STYLE_VOICING_REGISTER.rightHandMax,
    options.maxRightHandSpanSemitones,
  );
  const candidates: StyleVoicingCandidate[] = [];

  for (const leftHandNotes of leftPlacements) {
    for (const rightHandNotes of rightPlacements) {
      if (!handsDoNotCross(leftHandNotes, rightHandNotes)) continue;
      const allNotes = uniqueSorted([...leftHandNotes, ...rightHandNotes]);
      if (allNotes.length !== leftHandNotes.length + rightHandNotes.length) continue;
      if (findLowIntervalViolation(allNotes)) continue;
      if (
        options.requireOpenWidth
        && allNotes.length > 2
        && allNotes[allNotes.length - 1] - allNotes[0] < 24
      ) {
        continue;
      }
      candidates.push({
        styleId,
        leftHandNotes,
        rightHandNotes,
        allNotes,
        ...metadata,
      });
    }
  }

  return uniqueCandidates(candidates).sort(compareCandidate);
}

export function candidateStaticCost(candidate: StyleVoicingCandidate): number {
  const leftCenter = average(candidate.leftHandNotes);
  const rightCenter = average(candidate.rightHandNotes);
  return Math.abs(leftCenter - STYLE_VOICING_REGISTER.leftHandCenter)
    + Math.abs(rightCenter - STYLE_VOICING_REGISTER.rightHandCenter)
    + handSpan(candidate.leftHandNotes) * 0.25
    + handSpan(candidate.rightHandNotes) * 0.25;
}

export function compareCandidate(
  left: StyleVoicingCandidate,
  right: StyleVoicingCandidate,
): number {
  return candidateStaticCost(left) - candidateStaticCost(right)
    || (left.variant ?? "").localeCompare(right.variant ?? "")
    || compareNumbers(left.leftHandNotes, right.leftHandNotes)
    || compareNumbers(left.rightHandNotes, right.rightHandNotes)
    || left.styleId.localeCompare(right.styleId);
}

export function pitchClass(value: number): number {
  return ((Math.trunc(value) % 12) + 12) % 12;
}

export function pitchClassesForLabels(
  chord: ChordSymbol,
  labels: readonly string[],
  tonePitchClass: (label: string) => number | undefined,
): number[] {
  return labels.flatMap((label) => {
    if (label === "Bass") return [pitchClass(chord.bass ?? chord.root)];
    const resolved = tonePitchClass(label);
    return resolved === undefined ? [] : [resolved];
  });
}

function enumerateHandPlacements(
  pitchClasses: readonly number[],
  minMidiNote: number,
  maxMidiNote: number,
  maxSpan: number,
): number[][] {
  if (pitchClasses.length === 0) return [[]];
  const choices = pitchClasses.map((pc) => notesForPitchClass(pc, minMidiNote, maxMidiNote));
  const result: number[][] = [];

  function visit(index: number, current: number[]): void {
    if (index >= choices.length) {
      const notes = uniqueSorted(current);
      if (notes.length === pitchClasses.length && handSpan(notes) <= maxSpan) {
        result.push(notes);
      }
      return;
    }
    for (const note of choices[index]) visit(index + 1, [...current, note]);
  }

  visit(0, []);
  return uniqueNumberArrays(result);
}

function notesForPitchClass(
  targetPitchClass: number,
  minMidiNote: number,
  maxMidiNote: number,
): number[] {
  const result: number[] = [];
  for (let note = minMidiNote; note <= maxMidiNote; note += 1) {
    if (pitchClass(note) === pitchClass(targetPitchClass)) result.push(note);
  }
  return result;
}

function uniqueCandidates(candidates: readonly StyleVoicingCandidate[]): StyleVoicingCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = [
      candidate.variant ?? "",
      candidate.leftHandNotes.join("."),
      candidate.rightHandNotes.join("."),
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueNumberArrays(values: readonly number[][]): number[][] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.join(".");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function compareNumbers(left: readonly number[], right: readonly number[]): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? -1) - (right[index] ?? -1);
    if (difference !== 0) return difference;
  }
  return 0;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
