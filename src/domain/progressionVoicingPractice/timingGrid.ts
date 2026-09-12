/** Tone-independent musical grid shared by detached snapshots and playback. */
export const PROGRESSION_VOICING_PRACTICE_PPQ = 192 as const;

export function progressionPracticeTicksAtBeat(beats: number): number {
  const ticks = Math.round(beats * PROGRESSION_VOICING_PRACTICE_PPQ);
  if (!Number.isSafeInteger(ticks)) {
    throw new RangeError("Voicing Loop beat is outside the safe practice timing grid.");
  }
  return ticks;
}

export function progressionPracticeBeatAtTick(ticks: number): number {
  return ticks / PROGRESSION_VOICING_PRACTICE_PPQ;
}
