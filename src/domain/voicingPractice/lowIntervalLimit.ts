export interface LowIntervalViolation {
  lower: number;
  upper: number;
  requiredSemitones: number;
}

export function minimumLowIntervalSemitones(lowerMidiNote: number): number {
  if (lowerMidiNote <= 35) return 12;
  if (lowerMidiNote <= 47) return 7;
  if (lowerMidiNote <= 52) return 5;
  if (lowerMidiNote <= 57) return 4;
  if (lowerMidiNote <= 59) return 3;
  return 2;
}

export function findLowIntervalViolation(
  midiNotes: readonly number[],
): LowIntervalViolation | undefined {
  const notes = [...new Set(midiNotes)].sort((left, right) => left - right);
  for (let index = 1; index < notes.length; index += 1) {
    const lower = notes[index - 1];
    const upper = notes[index];
    const requiredSemitones = minimumLowIntervalSemitones(lower);
    if (upper - lower < requiredSemitones) {
      return { lower, upper, requiredSemitones };
    }
  }
  return undefined;
}
