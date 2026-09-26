import type { MidiPreviewNote } from "../audio/chordPreview";
import { voiceTextChordForAudition } from "./textChordTones";
import type { TextProgressionParseResult } from "./textProgression";

/** Standard's 4/4 attacks retain the parser's exact one/two/four-cell beat positions. */
export function standardTextPlaybackNotes(result: TextProgressionParseResult): readonly MidiPreviewNote[] {
  if (!result.canConvert) return [];
  return result.events.flatMap(event => voiceTextChordForAudition(event.chord).map(pitch => ({
    pitch, startBeat: (event.bar - 1) * 4 + event.startBeat - 1,
    durationBeats: event.durationBeats, velocity: 88,
  })));
}
