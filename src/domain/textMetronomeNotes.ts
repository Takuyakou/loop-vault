import type { MidiPreviewNote } from "../audio/chordPreview";

/** Beat-aligned clicks; the owning transport supplies its own BPM. */
export function textMetronomeNotes(lengthBeats: number, beatsPerBar: number): readonly MidiPreviewNote[] {
  const notes: MidiPreviewNote[] = [];
  if (!Number.isFinite(lengthBeats) || !Number.isFinite(beatsPerBar) || beatsPerBar <= 0) return notes;
  for (let beat = 0; beat < lengthBeats; beat += 1) {
    notes.push({
      pitch: beat % beatsPerBar === 0 ? 96 : 84,
      startBeat: beat, durationBeats: 0.075, velocity: 46,
    });
  }
  return notes;
}
