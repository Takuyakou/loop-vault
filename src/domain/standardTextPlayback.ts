import type { MidiPreviewNote } from "../audio/chordPreview";
import { voiceTextChordForAudition } from "./textChordTones";
import type { TextProgressionParseResult } from "./textProgression";
import { textMetronomeNotes } from "./textMetronomeNotes";
import { textProgressionEventKey, type TextProgressionVoicingOverrides } from "./textProgressionDraft";
import { resolveVoicingForUse } from "./voicing/resolveVoicing";

/** Standard's 4/4 attacks retain the parser's exact one/two/four-cell beat positions. */
export function standardTextPlaybackNotes(
  result: TextProgressionParseResult, overrides?: TextProgressionVoicingOverrides,
  metronome = false,
): readonly MidiPreviewNote[] {
  if (!result.canConvert) return [];
  const notes = result.events.flatMap(event => {
    const fallback = [...voiceTextChordForAudition(event.chord)];
    const pitches = resolveVoicingForUse(event.chord,
      overrides?.get(textProgressionEventKey(event)), fallback).midiNotes;
    return pitches.map(pitch => ({
      pitch, startBeat: (event.bar - 1) * 4 + event.startBeat - 1,
      durationBeats: event.durationBeats, velocity: 88,
    }));
  });
  return metronome ? [...notes, ...textMetronomeNotes(result.scoreLengthBeats, 4)] : notes;
}
