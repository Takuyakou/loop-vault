import type { ChordSymbol } from "../types";

export interface ExactBeat {
  readonly numerator: number;
  readonly denominator: number;
}

export interface SourceBasslineNote {
  readonly pitch: number;
  readonly start: ExactBeat;
  readonly duration: ExactBeat;
  readonly velocity: number;
  readonly continuesFromBefore: boolean;
  readonly continuesAfterEnd: boolean;
}

export interface CapturedHarmonySpan {
  readonly start: ExactBeat;
  readonly duration: ExactBeat;
  readonly rootPitchClass: number;
  readonly bassPitchClass: number | null;
  readonly allowedPitchClasses: readonly number[];
}

export interface CapturedHarmonyV1 {
  readonly schemaVersion: 1;
  readonly signature: string;
  readonly spans: readonly CapturedHarmonySpan[];
}

export interface SourceBasslineSnapshotV1 {
  readonly schemaVersion: 1;
  readonly sourceKind: "selected-bass-voice";
  readonly snapshotSignature: string;
  readonly capturedMeter: { readonly numerator: 4; readonly denominator: 4 };
  readonly length: ExactBeat;
  readonly capturedHarmony?: CapturedHarmonyV1;
  readonly notes: readonly SourceBasslineNote[];
}

/** Transient only. Identity and raw ticks never enter SourceBasslineSnapshotV1. */
export interface ExactSourceBasslineNote {
  readonly sourceId: string;
  readonly voiceId: string;
  readonly pitch: number;
  readonly velocity: number;
  readonly startTick: number;
  readonly durationTick: number;
  readonly ticksPerQuarter: number;
  readonly sourceEventIndex?: number;
}

/** A proven half-open range belonging to the same MIDI source as the Voice. */
export interface ExactSourceBasslineRange {
  readonly authority: "raw-integer-ticks";
  readonly constantMeterProven: true;
  readonly barAlignmentProven: true;
  readonly sourceId: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly sourceEndTick: number;
  readonly ticksPerQuarter: number;
  readonly meter: { readonly numerator: 4; readonly denominator: 4 };
}

export interface ExactCapturedChordSpan {
  readonly sourceId: string;
  readonly startTick: number;
  readonly durationTick: number;
  readonly ticksPerQuarter: number;
  readonly chord: ChordSymbol;
}

/** Transient proof that captured harmony came from the exact selected source range. */
export interface ExactCapturedHarmonyInput {
  readonly authority: "raw-integer-ticks";
  readonly sourceId: string;
  readonly rangeStartTick: number;
  readonly rangeEndTick: number;
  readonly ticksPerQuarter: number;
  readonly spans: readonly ExactCapturedChordSpan[];
}
