import type { MidiPreviewNote } from "../audio/chordPreview";
import { voiceTextChordForAudition } from "./textChordTones";
import type { ExtendedTextResult } from "./extendedTextProgression";

/** Immutable note-event plan from authored attacks; = sustains and _ stays silent. */
export function extendedTextPlaybackNotes(result: ExtendedTextResult, metronome = false): readonly MidiPreviewNote[] {
  if (!result.canConvert) return [];
  const notes: MidiPreviewNote[] = [];
  for (const span of result.harmonicSpans) {
    const pitches = voiceTextChordForAudition(span.chord);
    const end = span.startBeat + span.durationBeats;
    for (let index = 0; index < span.attacks.length; index += 1) {
      const attack = span.attacks[index]!;
      const next = span.attacks[index + 1]?.beat ?? end;
      const duration = next - attack.beat;
      if (duration <= 0) continue;
      for (const pitch of pitches) notes.push({
        pitch, startBeat: attack.beat, durationBeats: duration, velocity: 88,
      });
    }
  }
  if (metronome) for (let beat = 0; beat < result.scoreLengthBeats; beat += 1) {
    notes.push({
      pitch: beat % result.beatsPerBar === 0 ? 96 : 84,
      startBeat: beat, durationBeats: 0.075, velocity: 46,
    });
  }
  return notes;
}
