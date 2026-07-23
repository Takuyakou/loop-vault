import { normalizePc } from "../chords";
import type {
  PracticeChordRequirements,
  PracticeInputSnapshot,
  PracticeMatchResult,
} from "./types";

export function matchPerformance(
  requirements: PracticeChordRequirements,
  input: PracticeInputSnapshot,
  requiredAttackRevision = 0,
): PracticeMatchResult {
  const heldPitchClasses = unique(input.heldMidiNotes.map(normalizePc));
  const missingPitchClasses = requirements.requiredPitchClasses.filter(
    (pitchClass) => !heldPitchClasses.includes(pitchClass),
  );
  const foreignPitchClasses = heldPitchClasses.filter(
    (pitchClass) => !requirements.allowedPitchClasses.includes(pitchClass),
  );
  const bass = input.heldMidiNotes.length > 0 ? normalizePc(Math.min(...input.heldMidiNotes)) : undefined;
  const bassMatches = requirements.requiredBassPitchClass === undefined
    || bass === requirements.requiredBassPitchClass;
  const attackSatisfied = input.attackRevision >= requiredAttackRevision;
  const state = heldPitchClasses.length === 0
    ? "empty"
    : foreignPitchClasses.length > 0
      ? "wrong"
      : missingPitchClasses.length > 0 || !bassMatches || !attackSatisfied
        ? "partial"
        : "match";

  return {
    state,
    heldPitchClasses,
    missingPitchClasses,
    foreignPitchClasses,
    bassMatches,
    attackSatisfied,
  };
}

function unique(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

