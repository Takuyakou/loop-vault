import type { MidiPreviewNote } from "../../../audio/chordPreview";
import type { AnalysisSession } from "./types";

export function sessionPreviewNotes(
  session: AnalysisSession,
  fromBeat = 0,
): MidiPreviewNote[] {
  const mutedSources = new Set(
    session.sources.filter((source) => source.muted).map((source) => source.id),
  );
  const analysisVoices = session.voices.filter((voice) =>
    voice.included
    && !voice.duplicateOf
    && !mutedSources.has(voice.sourceId));
  const soloVoiceIds = new Set(
    analysisVoices
      .filter((voice) => voice.solo)
      .map((voice) => voice.id),
  );
  const audibleVoiceIds = new Set(
    (soloVoiceIds.size
      ? analysisVoices.filter((voice) => soloVoiceIds.has(voice.id))
      : analysisVoices.filter((voice) => !voice.muted))
      .map((voice) => voice.id),
  );
  return session.notes.flatMap((note): MidiPreviewNote[] => {
    if (!audibleVoiceIds.has(note.voiceId)) return [];
    const endBeat = note.startBeat + note.durationBeats;
    if (endBeat <= fromBeat) return [];
    return [{
      pitch: note.pitch,
      startBeat: Math.max(0, note.startBeat - fromBeat),
      durationBeats: endBeat - Math.max(note.startBeat, fromBeat),
      velocity: note.velocity,
    }];
  }).sort((left, right) =>
    left.startBeat - right.startBeat
    || left.pitch - right.pitch
    || left.durationBeats - right.durationBeats);
}
