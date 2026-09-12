import type { ChordQuality, Tension } from "../types";

export const PROGRESSION_VOICING_PRACTICE_SNAPSHOT_VERSION = 1 as const;

export type ProgressionVoicingSelection =
  | "source-midi"
  | "custom"
  | "basic-shell"
  | "basic-full"
  | "left-hand";

export interface ProgressionPracticeSourceReference {
  readonly ideaId: string;
  readonly blockId: string;
}

export interface DetachedPracticeVoicing {
  readonly kind: "source-midi" | "custom";
  readonly midiNotes: readonly number[];
  readonly bassNote?: number;
}

export interface ProgressionPracticeChord {
  readonly root: number;
  readonly quality: ChordQuality;
  readonly tensions: readonly Tension[];
  readonly bass?: number;
  readonly label: string;
}

export interface ProgressionPracticeEvent {
  readonly id: string;
  readonly startBeat: number;
  readonly durationBeats: number;
  readonly chord: ProgressionPracticeChord;
  /** Exact selected MY voicing only. Lesson selections resolve later. */
  readonly voicing?: DetachedPracticeVoicing;
}

export interface ProgressionVoicingPracticeSnapshot {
  readonly version: typeof PROGRESSION_VOICING_PRACTICE_SNAPSHOT_VERSION;
  readonly fingerprint: string;
  readonly source: {
    readonly kind: "vault";
    readonly reference: ProgressionPracticeSourceReference;
  };
  readonly selection: ProgressionVoicingSelection;
  readonly key?: string;
  readonly bpm: number;
  readonly meter: { readonly numerator: 4; readonly denominator: 4 };
  readonly lengthBeats: number;
  readonly events: readonly ProgressionPracticeEvent[];
}

export type ProgressionPracticeSnapshotErrorCode =
  | "invalid-reference"
  | "invalid-selection"
  | "invalid-bpm"
  | "unsupported-meter"
  | "invalid-key"
  | "empty-progression"
  | "invalid-chord"
  | "invalid-timing";

export interface ProgressionPracticeSnapshotError {
  readonly code: ProgressionPracticeSnapshotErrorCode;
  readonly message: string;
}

export type ProgressionPracticeSnapshotResult =
  | { readonly ok: true; readonly snapshot: ProgressionVoicingPracticeSnapshot }
  | { readonly ok: false; readonly error: ProgressionPracticeSnapshotError };
