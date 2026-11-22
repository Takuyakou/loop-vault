import { physicalVoicingSignature, rankCyclicFingerings, type FingeringAnchor, type FingeringHand, type FingeringRankingOptions } from "../domain/progressionFingering";
import { P21_POLICY, type P21CostModel } from "../domain/p21SingleNoteFingering";
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
  const model = options.costModel;
  if (model && "singleNotePreserving" in model && model.singleNotePreserving) {
    const p21 = model as P21CostModel;
    const sounding = events.filter(event => new Set(event.midiPitches).size > 0).length;
    // §3-3: a hand above the limit keeps the old E1-T result; P21 is not applied to it.
    if (sounding > P21_POLICY.maxCards) return rankCyclicFingerings(events, { ...options, costModel: p21.legacy, anchors, loopDurationSeconds: loopEnd * secondsPerBeat });
    const fixed = new Map<string, FingeringAnchor>();
    for (const [id, personal] of anchors) fixed.set(id, { signature: personal.signature, fingers: personal.fingers });
    if (events.some(event => new Set(event.midiPitches).size > 1)) {
      // Stage 1: the existing E1-T (P11-13e) decides the whole hand; stage 2 keeps every 2+-note card's fingers.
      const base = rankCyclicFingerings(events, { ...options, costModel: p21.legacy, anchors, loopDurationSeconds: loopEnd * secondsPerBeat });
      // No one-note card: the P21 stage cannot change anything, so keep the first-stage result as-is.
      if (!events.some(event => new Set(event.midiPitches).size === 1)) return base;
      base.forEach((result, index) => {
        if (result.status === "supported" && new Set(events[index]!.midiPitches).size > 1 && !fixed.has(result.id)) {
          fixed.set(result.id, { signature: result.signature, fingers: result.fingers });
        }
      });
    }
    return rankCyclicFingerings(events, { ...options, costModel: p21, anchors: fixed, loopDurationSeconds: loopEnd * secondsPerBeat });
  }
  return rankCyclicFingerings(events, { ...options, anchors, loopDurationSeconds: loopEnd * secondsPerBeat });
}
