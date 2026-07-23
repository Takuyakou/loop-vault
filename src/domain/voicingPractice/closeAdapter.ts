import { voiceChordForPreview } from "../chordVoicing";
import { normalizedChordKey } from "../voicing";
import type { GeneratedStyleVoicing, SavedChordEvent } from "./types";

export const STYLE_VOICING_GENERATOR_VERSION = 1;

export function adaptGeneratedCloseVoicing(
  event: SavedChordEvent,
  index: number,
): GeneratedStyleVoicing {
  const allNotes = [...voiceChordForPreview(event.chord).notes]
    .sort((left, right) => left - right);
  const leftCount = allNotes.length >= 5 ? 2 : 1;
  return {
    eventId: event.eventId ?? `style-event-${index}`,
    chordKey: normalizedChordKey(event.chord),
    styleId: "generated-close",
    generatorVersion: STYLE_VOICING_GENERATOR_VERSION,
    leftHandNotes: allNotes.slice(0, leftCount),
    rightHandNotes: allNotes.slice(leftCount),
    allNotes,
    requiredIntervals: [],
    addedColorIntervals: [],
    omittedIntervals: [],
    warnings: [],
  };
}
