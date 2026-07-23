import { normalizePc } from "../chords";
import type {
  PracticeInputSnapshot,
  PracticeMatchResult,
} from "../practice";

export function matchPitchClasses(
  targetMidiNotes: readonly number[],
  input: PracticeInputSnapshot,
  requiredAttackRevision = 0,
): PracticeMatchResult {
  const target = unique(targetMidiNotes.map(normalizePc));
  const held = unique(input.heldMidiNotes.map(normalizePc));
  const missingPitchClasses = target.filter((pitchClass) => !held.includes(pitchClass));
  const foreignPitchClasses = held.filter((pitchClass) => !target.includes(pitchClass));
  const attackSatisfied = input.attackRevision >= requiredAttackRevision;
  const complete = missingPitchClasses.length === 0 && foreignPitchClasses.length === 0;

  return {
    state: held.length === 0
      ? "empty"
      : foreignPitchClasses.length > 0
        ? "wrong"
        : complete && attackSatisfied
          ? "match"
          : "partial",
    heldPitchClasses: held,
    missingPitchClasses,
    foreignPitchClasses,
    bassMatches: true,
    attackSatisfied,
  };
}

function unique(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}
