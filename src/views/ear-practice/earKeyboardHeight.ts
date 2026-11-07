/** How high the keys of the practice keyboard are drawn, as a multiple of the width of a white key (what a keyboard on the screen looks right at). */
export const KEY_HEIGHT_RATIO = 4.2;

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);

/** The white keys from `low` to `high` (MIDI note numbers, both included). */
export function whiteKeysIn(low: number, high: number): number {
  let count = 0;
  for (let note = low; note <= high; note += 1) if (WHITE_PITCH_CLASSES.has(((note % 12) + 12) % 12)) count += 1;
  return count;
}

/**
 * The height of the keys in pixels: the width of a white key times about 4.2, or the room the window has when that is less,
 * and never under 112 px (92 px in a narrow window), which is what the keyboard was before and always fits.
 */
export function keyboardKeyHeight(input: { width: number; whiteKeys: number; room: number; narrowWindow: boolean }): number {
  const lowest = input.narrowWindow ? 92 : 112;
  const wanted = (input.width / Math.max(1, input.whiteKeys)) * KEY_HEIGHT_RATIO;
  return Math.round(Math.max(lowest, Math.min(wanted, input.room)));
}
