import { extractionNotes } from "./extractSimultaneousVoicing";
import type { VoicingCandidate, VoicingExtractionInput } from "./types";

export function extractAggregatedCandidate(
  input: VoicingExtractionInput,
): VoicingCandidate | undefined {
  const notes = extractionNotes(input);
  if (notes.length < 2) return undefined;
  const byPitch = new Map<number, number>();
  for (const note of notes) {
    const roleWeight = note.role === "melody" ? 0.2
      : note.role === "pad" ? 0.65
        : note.role === "harmony" ? 1
          : note.role === "bass" ? 0.8
            : 0.5;
    byPitch.set(
      note.pitch,
      (byPitch.get(note.pitch) ?? 0) + (note.endBeat - note.startBeat) * roleWeight,
    );
  }
  const selected = [...byPitch.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .slice(0, 10)
    .map(([pitch]) => pitch)
    .sort((left, right) => left - right);
  if (selected.length < 2) return undefined;
  const bassNotes = notes
    .filter((note) => note.role === "bass")
    .map((note) => note.pitch)
    .sort((a, b) => a - b);
  return {
    midiNotes: selected,
    bassNote: bassNotes[0] ?? selected[0],
    representation: "aggregated-note-set",
    durationBeats: input.segment.endBeat - input.segment.startBeat,
    onsetBeat: input.segment.startBeat,
    roleScore: 0.45,
  };
}
