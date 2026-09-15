import type {
  ProgressionVoicingSelection,
  ResolvedProgressionPracticeVoicing,
} from "../domain/progressionVoicingPractice";

export interface ProgressionFingeringHandTargets {
  readonly left: readonly number[];
  readonly right: readonly number[];
}

const EMPTY_NOTES: readonly number[] = Object.freeze([]);

/**
 * Returns only hand assignments already present in the resolved performance plan.
 * It never adds, removes, transposes, or re-octaves a playback pitch.
 */
export function progressionFingeringHandTargets(
  selection: ProgressionVoicingSelection,
  voicing: ResolvedProgressionPracticeVoicing,
): ProgressionFingeringHandTargets {
  if (selection === "left-hand") {
    return { left: voicing.midiNotes, right: EMPTY_NOTES };
  }

  if (voicing.leftHandNotes || voicing.rightHandNotes) {
    return {
      left: voicing.leftHandNotes ?? EMPTY_NOTES,
      right: voicing.rightHandNotes ?? EMPTY_NOTES,
    };
  }

  if (selection === "source-midi" || selection === "custom") {
    const bass = voicing.bassNote;
    if (bass !== undefined && voicing.midiNotes.includes(bass)) {
      return {
        left: Object.freeze([bass]),
        right: Object.freeze(voicing.midiNotes.filter((pitch) => pitch !== bass)),
      };
    }
    return { left: EMPTY_NOTES, right: voicing.midiNotes };
  }

  return { left: EMPTY_NOTES, right: voicing.midiNotes };
}
