import type { PreviewSound } from "../../audio/chordPreview";
import { beatsPerBar } from "../../domain/midi";
import type { SavedProgressionBlock } from "../../domain/types";
import { resolveTimelineVoicings } from "../../domain/voicing";

/**
 * P23-29: the ▶ 試聴 request of a saved progression, shared by the Vault's right column and the Voicing
 * Loop's picker so both play the same notes at the same speed.
 */
export function previewRequestOf(block: SavedProgressionBlock, bpm: number | undefined, sound: PreviewSound) {
  return {
    type: "timeline" as const,
    timeline: block.chords,
    bpm,
    sound,
    beatsPerBar: beatsPerBar(block.timeSignature),
    explicitMidiNotesByEventId: resolveTimelineVoicings(block.chords, Boolean(block.textSource)),
  };
}
