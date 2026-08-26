export type P524HarmonicRhythm = 1 | 2 | 4 | 8 | "unknown";

export interface P524BassState {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly pitchClass: number;
  readonly transientPitchClasses?: readonly number[];
}

export interface P524HarmonicState {
  readonly startBeat: number;
  readonly endBeat: number;
  readonly pitchClasses: readonly number[];
  readonly label: string;
}
