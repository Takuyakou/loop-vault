import type { ChordSymbol, VoicingSnapshot } from "../types";

export function normalizeMidiNotes(notes: readonly number[]): number[] {
  return [...new Set(notes.filter((note) => Number.isInteger(note) && note >= 0 && note <= 127))]
    .sort((left, right) => left - right);
}

export function normalizedChordKey(chord: ChordSymbol): string {
  const tensions = [...new Set(chord.tensions)].sort().join(",");
  return [
    normalizePitchClass(chord.root),
    chord.quality,
    tensions || "-",
    chord.bass === undefined ? "-" : normalizePitchClass(chord.bass),
  ].join(":");
}

export function isValidVoicingSnapshot(snapshot: VoicingSnapshot): boolean {
  const normalized = normalizeMidiNotes(snapshot.midiNotes);
  return snapshot.schemaVersion === 1
    && snapshot.capturedForChordKey.trim().length > 0
    && normalized.length >= 2
    && normalized.length <= 10
    && normalized.length === snapshot.midiNotes.length
    && normalized.every((note, index) => note === snapshot.midiNotes[index])
    && (snapshot.bassNote === undefined || normalized.includes(snapshot.bassNote))
    && (snapshot.confidence === undefined
      || (snapshot.confidence >= 0 && snapshot.confidence <= 1));
}

export function normalizePitchClass(value: number): number {
  return ((Math.trunc(value) % 12) + 12) % 12;
}
