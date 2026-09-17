import {
  candidateStaticCost,
  type StyleVoicingCandidate,
} from "./candidateTools";

const UNMATCHED_VOICE_PENALTY = 7;
const NOTE_COUNT_CHANGE_PENALTY = 3;
const COMMON_TONE_BONUS = 4;
const TOP_VOICE_MOTION_WEIGHT = 3;
const GUIDE_TONE_MOTION_WEIGHT = 1.5;
const REGISTER_CONTINUITY_WEIGHT = 0.5;
const SPAN_CONTINUITY_WEIGHT = 0.5;

export function styleVoicingStartCost(candidate: StyleVoicingCandidate): number {
  return candidateStaticCost(candidate);
}

export function styleVoicingTransitionCost(
  previous: StyleVoicingCandidate,
  current: StyleVoicingCandidate,
): number {
  const previousNotes = previous.allNotes;
  const currentNotes = current.allNotes;
  const rightHandMotion = orderedVoiceMotion(previous.rightHandNotes, current.rightHandNotes);
  const leftHandMotion = orderedVoiceMotion(previous.leftHandNotes, current.leftHandNotes);
  const innerVoiceMotion = orderedVoiceMotion(innerVoices(previousNotes), innerVoices(currentNotes));
  const guideToneMotion = orderedVoiceMotion(
    previous.guideToneNotes ?? [],
    current.guideToneNotes ?? [],
  ) * GUIDE_TONE_MOTION_WEIGHT;
  const unmatchedVoicePenalty = Math.abs(previousNotes.length - currentNotes.length)
    * UNMATCHED_VOICE_PENALTY;
  const topVoiceLeapPenalty = leapPenalty(last(previousNotes), last(currentNotes));
  const topVoiceMotion = distance(last(previousNotes), last(currentNotes)) * TOP_VOICE_MOTION_WEIGHT;
  const lowestVoiceLeapPenalty = leapPenalty(previousNotes[0], currentNotes[0]);
  const noteCountChangePenalty = Math.abs(previousNotes.length - currentNotes.length)
    * NOTE_COUNT_CHANGE_PENALTY;
  const commonToneBonus = currentNotes.filter((note) => previousNotes.includes(note)).length
    * COMMON_TONE_BONUS;
  const registerContinuity = (
    distance(average(previous.leftHandNotes), average(current.leftHandNotes))
    + distance(average(previous.rightHandNotes), average(current.rightHandNotes))
  ) * REGISTER_CONTINUITY_WEIGHT;
  const spanContinuity = (
    Math.abs(span(previous.leftHandNotes) - span(current.leftHandNotes))
    + Math.abs(span(previous.rightHandNotes) - span(current.rightHandNotes))
  ) * SPAN_CONTINUITY_WEIGHT;

  return rightHandMotion
    + leftHandMotion
    + innerVoiceMotion
    + guideToneMotion
    + topVoiceMotion
    + unmatchedVoicePenalty
    + topVoiceLeapPenalty
    + lowestVoiceLeapPenalty
    + noteCountChangePenalty
    + registerContinuity
    + spanContinuity
    - commonToneBonus;
}

function orderedVoiceMotion(previous: readonly number[], current: readonly number[]): number {
  const matched = Math.min(previous.length, current.length);
  let motion = 0;
  for (let index = 0; index < matched; index += 1) {
    motion += Math.abs(previous[index]! - current[index]!);
  }
  return motion;
}

function innerVoices(values: readonly number[]): readonly number[] {
  return values.length > 2 ? values.slice(1, -1) : [];
}

function average(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function span(values: readonly number[]): number {
  if (values.length < 2) return 0;
  return values[values.length - 1]! - values[0]!;
}

function distance(previous: number | undefined, current: number | undefined): number {
  return previous === undefined || current === undefined ? 0 : Math.abs(previous - current);
}

function leapPenalty(previous: number | undefined, current: number | undefined): number {
  if (previous === undefined || current === undefined) return 0;
  const leap = Math.abs(previous - current);
  return leap > 7 ? (leap - 7) * 2 : 0;
}

function last(values: readonly number[]): number | undefined {
  return values[values.length - 1];
}
