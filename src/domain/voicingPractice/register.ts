export const STYLE_VOICING_REGISTER = {
  leftHandMin: 36,
  leftHandMax: 64,
  rightHandMin: 52,
  rightHandMax: 88,
  leftHandCenter: 48,
  rightHandCenter: 67,
} as const;

export function handSpan(notes: readonly number[]): number {
  if (notes.length < 2) return 0;
  return Math.max(...notes) - Math.min(...notes);
}

export function handsDoNotCross(
  leftHandNotes: readonly number[],
  rightHandNotes: readonly number[],
): boolean {
  return leftHandNotes.length === 0
    || rightHandNotes.length === 0
    || Math.max(...leftHandNotes) <= Math.min(...rightHandNotes);
}
