import type { Gain } from "tone";

/**
 * The tools for letting a sound out without a click. A sound that is cut off in the middle of its wave is heard as a click;
 * a sound whose output gain is brought to zero over a few milliseconds, and only then thrown away, is not.
 * (Shared by the Voicing Loop's audition and the preview audio.)
 */

/** How long the outgoing bank of an audition takes to fade, and how late the incoming one starts. */
export const AUDITION_FADE_SECONDS = 0.012;
export const AUDITION_ATTACK_SECONDS = 0.005;
/** How long a faded audition bank is kept before it is thrown away. */
export const AUDITION_RETIRE_MS = 24;

/** How long a preview that is stopped takes to fade out, and how long its instrument is kept (it is thrown away by a timer, so that it is thrown away even if the audio clock has stopped). */
export const PREVIEW_STOP_FADE_SECONDS = 0.015;
export const PREVIEW_STOP_RETIRE_MS = 40;
/** How many instruments may be fading out at once: a burst of stops throws the oldest away at once. */
export const MAX_FADING_INSTRUMENTS = 2;

/** Preserve the current value while retriggering; never jump a sounding gain to zero. */
export function rampOutputGain(output: Gain, value: 0 | 1, start: number, end: number, cancel = false): void {
  const gain = output.gain;
  const held = gain.getValueAtTime(start);
  if (cancel) gain.cancelScheduledValues(start);
  gain.setValueAtTime(held, start);
  gain.linearRampToValueAtTime(value, end);
}
