export interface ChordTiming {
  startBeat: number;
  durationBeats: number;
}

export function chordProgressFraction(
  chord: ChordTiming | undefined,
  bpm: number,
  transportSeconds: number,
): number | null {
  if (chord === undefined || bpm <= 0 || chord.durationBeats <= 0) {
    return null;
  }

  const secondsPerBeat = 60 / bpm;
  const startSeconds = chord.startBeat * secondsPerBeat;
  const durationSeconds = chord.durationBeats * secondsPerBeat;
  const elapsed = transportSeconds - startSeconds;

  return Math.max(0, Math.min(1, elapsed / durationSeconds));
}
