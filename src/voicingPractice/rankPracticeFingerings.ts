import { physicalVoicingSignature, rankCyclicFingerings, type FingeringHand, type FingeringRankingOptions } from "../domain/progressionFingering";
import type { ProgressionVoicingPracticeSnapshot, ProgressionVoicingSelection } from "../domain/progressionVoicingPractice";
import type { ProgressionFingeringHandTargets } from "./fingeringDisplay";
import type { FingeringPreferenceCollection } from "./fingeringPreferences";
import { findPersonalFingering } from "./fingeringPreferences";

/** The progression remains the optimization scope; Range is deliberately not an input. */
export function rankPracticeHandFingerings(
  snapshot: ProgressionVoicingPracticeSnapshot | undefined,
  hands: readonly ProgressionFingeringHandTargets[],
  selection: ProgressionVoicingSelection,
  hand: FingeringHand,
  preferences?: FingeringPreferenceCollection,
  options: FingeringRankingOptions = {},
  unresolved: readonly boolean[] = [],
  practiceBpm?: number,
): ReturnType<typeof rankCyclicFingerings> {
  if (!snapshot) return [];
  const secondsPerBeat = 60 / (practiceBpm ?? snapshot.bpm);
  const events = snapshot.events.map((event, i) => ({
    id: event.id, hand, midiPitches: hands[i]?.[hand] ?? [], chord: event.chord, family: selection,
    startSeconds: event.startBeat * secondsPerBeat,
    durationSeconds: event.durationBeats * secondsPerBeat,
    unresolved: unresolved[i] ?? false,
  }));
  const anchors = new Map(events.flatMap(event => {
    const personal = preferences && findPersonalFingering(preferences, physicalVoicingSignature(hand, event.midiPitches));
    return personal ? [[event.id, personal] as const] : [];
  }));
  const loopEnd = snapshot.lengthBeats;
  return rankCyclicFingerings(events, { ...options, anchors, loopDurationSeconds: loopEnd * secondsPerBeat });
}
