import {
  candidateStaticCost,
  type StyleVoicingCandidate,
} from "./candidateTools";

const UNMATCHED_VOICE_PENALTY = 7;
const NOTE_COUNT_CHANGE_PENALTY = 3;
const COMMON_TONE_BONUS = 4;

export function styleVoicingStartCost(candidate: StyleVoicingCandidate): number {
  return candidateStaticCost(candidate);
}

export function styleVoicingTransitionCost(
  previous: StyleVoicingCandidate,
  current: StyleVoicingCandidate,
): number {
  const previousNotes = previous.allNotes;
  const currentNotes = current.allNotes;
  const matched = Math.min(previousNotes.length, currentNotes.length);
  let totalVoiceMotion = 0;
  for (let index = 0; index < matched; index += 1) {
    totalVoiceMotion += Math.abs(previousNotes[index] - currentNotes[index]);
  }
  const unmatchedVoicePenalty = Math.abs(previousNotes.length - currentNotes.length)
    * UNMATCHED_VOICE_PENALTY;
  const topVoiceLeapPenalty = leapPenalty(last(previousNotes), last(currentNotes));
  const lowestVoiceLeapPenalty = leapPenalty(previousNotes[0], currentNotes[0]);
  const noteCountChangePenalty = Math.abs(previousNotes.length - currentNotes.length)
    * NOTE_COUNT_CHANGE_PENALTY;
  const commonToneBonus = currentNotes.filter((note) => previousNotes.includes(note)).length
    * COMMON_TONE_BONUS;

  return totalVoiceMotion
    + unmatchedVoicePenalty
    + topVoiceLeapPenalty
    + lowestVoiceLeapPenalty
    + noteCountChangePenalty
    - commonToneBonus;
}

function leapPenalty(previous: number | undefined, current: number | undefined): number {
  if (previous === undefined || current === undefined) return 0;
  const leap = Math.abs(previous - current);
  return leap > 7 ? (leap - 7) * 2 : 0;
}

function last(values: readonly number[]): number | undefined {
  return values[values.length - 1];
}
