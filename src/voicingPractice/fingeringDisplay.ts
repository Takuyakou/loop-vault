import { generateFingeringCandidates, physicalVoicingSignature } from "../domain/progressionFingering";
import type {
  ProgressionVoicingSelection,
  ResolvedProgressionPracticeVoicing,
} from "../domain/progressionVoicingPractice";
import type { FingeringPreferenceCollection } from "./fingeringPreferences";

export interface ProgressionFingeringHandTargets {
  readonly left: readonly number[];
  readonly right: readonly number[];
}

const EMPTY_NOTES: readonly number[] = Object.freeze([]);

export function isPracticeHandAssignmentPlayable(
  sourceNotes: readonly number[],
  assignment: ProgressionFingeringHandTargets,
): boolean {
  if (assignment.left.length > 5 || assignment.right.length > 5) return false;
  if (assignment.left.length && assignment.right.length
    && Math.max(...assignment.left) > Math.min(...assignment.right)) return false;
  const assigned = [...assignment.left, ...assignment.right].sort((a, b) => a - b);
  const source = [...sourceNotes].sort((a, b) => a - b);
  return assigned.length === source.length && assigned.every((note, index) => note === source[index]);
}

/** Practice-only partition. Playback always uses the unmodified resolved midiNotes. */
export function progressionFingeringHandTargets(
  selection: ProgressionVoicingSelection,
  voicing: ResolvedProgressionPracticeVoicing,
): ProgressionFingeringHandTargets {
  return handCandidates(selection, voicing)[0] ?? { left: EMPTY_NOTES, right: EMPTY_NOTES };
}

/** Chooses bounded, ordered splits with local fingerability and neighboring-hand movement. */
export function assignPracticeHandsAcrossProgression(
  selection: ProgressionVoicingSelection,
  voicings: readonly (ResolvedProgressionPracticeVoicing | undefined)[],
  preferences?: FingeringPreferenceCollection,
): readonly ProgressionFingeringHandTargets[] {
  const groups = voicings.map((voicing) => voicing ? handCandidates(selection, voicing, preferences) : []);
  const assignments: ProgressionFingeringHandTargets[] = Array.from({ length: voicings.length }, () => ({ left: EMPTY_NOTES, right: EMPTY_NOTES }));
  let start = 0;
  while (start < groups.length) {
    if (!groups[start]!.length) { start += 1; continue; }
    let end = start + 1;
    while (end < groups.length && groups[end]!.length) end += 1;
    let states = groups[start]!.map((candidate, index) => ({ cost: localCost(candidate, voicings[start]!, preferences), indexes: [index] }));
    for (let eventIndex = start + 1; eventIndex < end; eventIndex += 1) {
      const previous = groups[eventIndex - 1]!;
      states = groups[eventIndex]!.map((candidate, index) => {
        const best = states.map((state) => ({
          cost: state.cost + localCost(candidate, voicings[eventIndex]!, preferences)
            + movementCost(previous[state.indexes[state.indexes.length - 1]!]!, candidate),
          indexes: [...state.indexes, index],
        })).sort((a, b) => a.cost - b.cost || compareIndexes(a.indexes, b.indexes))[0]!;
        return best;
      });
    }
    const best = states.sort((a, b) => a.cost - b.cost || compareIndexes(a.indexes, b.indexes))[0]!;
    for (let eventIndex = start; eventIndex < end; eventIndex += 1) {
      assignments[eventIndex] = groups[eventIndex]![best.indexes[eventIndex - start]!]!;
    }
    start = end;
  }
  return assignments;
}

function handCandidates(
  selection: ProgressionVoicingSelection,
  voicing: ResolvedProgressionPracticeVoicing,
  preferences?: FingeringPreferenceCollection,
): ProgressionFingeringHandTargets[] {
  if (selection === "left-hand" && voicing.origin === "left-hand") return [{ left: voicing.midiNotes, right: EMPTY_NOTES }];
  // An explicit assignment belongs to the chosen voicing and is never rebalanced.
  if (voicing.leftHandNotes || voicing.rightHandNotes) {
    return [{ left: voicing.leftHandNotes ?? EMPTY_NOTES, right: voicing.rightHandNotes ?? EMPTY_NOTES }];
  }
  if (selection !== "saved" && selection !== "source-midi" && selection !== "custom") return [{ left: EMPTY_NOTES, right: voicing.midiNotes }];
  const notes = [...voicing.midiNotes].sort((a, b) => a - b);
  if (new Set(notes).size !== notes.length || notes.some((note) => !Number.isInteger(note) || note < 0 || note > 127)) return [];
  const result: ProgressionFingeringHandTargets[] = [];
  for (let leftCount = Math.max(0, notes.length - 5); leftCount <= Math.min(5, notes.length); leftCount += 1) {
    const candidate = { left: notes.slice(0, leftCount), right: notes.slice(leftCount) };
    if (candidate.left.length <= 5 && candidate.right.length <= 5) result.push(candidate);
  }
  return result.sort((a, b) => localCost(a, voicing, preferences) - localCost(b, voicing, preferences)
    || a.left.length - b.left.length);
}

function localCost(
  candidate: ProgressionFingeringHandTargets,
  voicing: ResolvedProgressionPracticeVoicing,
  preferences?: FingeringPreferenceCollection,
): number {
  let cost = candidate.left.length * 0.35;
  if (voicing.bassNote !== undefined && candidate.right.includes(voicing.bassNote)) cost += 20;
  for (const [hand, pitches, center] of [
    ["left", candidate.left, 49], ["right", candidate.right, 68],
  ] as const) {
    if (!pitches.length) continue;
    const span = pitches[pitches.length - 1]! - pitches[0]!;
    const midpoint = (pitches[0]! + pitches[pitches.length - 1]!) / 2;
    cost += Math.max(0, span - 12) * 1.4 + span * 0.08 + Math.abs(midpoint - center) * 0.08;
    const fingering = generateFingeringCandidates({ hand, midiPitches: pitches });
    cost += fingering.status === "supported" ? fingering.candidates[0]!.localCost * 0.02 : 1000;
    const signature = physicalVoicingSignature(hand, pitches);
    if (signature && preferences?.entries.some((entry) => entry.signature === signature)) cost -= 100;
  }
  return cost;
}

function movementCost(previous: ProgressionFingeringHandTargets, current: ProgressionFingeringHandTargets): number {
  let cost = 0;
  for (const hand of ["left", "right"] as const) {
    const prior = previous[hand];
    const next = current[hand];
    if (!prior.length || !next.length) continue;
    cost += Math.abs(midpoint(prior) - midpoint(next)) * 0.08;
  }
  return cost;
}

function midpoint(notes: readonly number[]): number {
  return (notes[0]! + notes[notes.length - 1]!) / 2;
}

function compareIndexes(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  }
  return 0;
}
