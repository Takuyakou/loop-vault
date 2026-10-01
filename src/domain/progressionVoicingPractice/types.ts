import type { ChordQuality, Tension } from "../types";
import type { VoicingRuleExplanation } from "../voicingRules";

export const PROGRESSION_VOICING_PRACTICE_SNAPSHOT_VERSION = 1 as const;

export type ProgressionVoicingSelection =
  | "saved"
  | "source-midi"
  | "custom"
  | "basic-shell"
  | "basic-full"
  | "rootless-shell"
  | "full-shell"
  | "left-hand";

export interface ProgressionPracticeSourceReference {
  readonly ideaId: string;
  readonly blockId: string;
}

export interface DetachedPracticeVoicing {
  readonly kind: "saved" | "source-midi" | "custom";
  readonly savedSource?: "source-midi" | "custom";
  readonly midiNotes: readonly number[];
  readonly bassNote?: number;
}

export interface ProgressionPracticeChord {
  readonly root: number;
  readonly quality: ChordQuality;
  readonly tensions: readonly Tension[];
  readonly omissions?: readonly ("3" | "5")[];
  readonly bass?: number;
  readonly label: string;
}

export interface ProgressionPracticeEvent {
  readonly id: string;
  readonly startBeat: number;
  readonly durationBeats: number;
  /** Text-only rearticulation grid; absence means one attack at startBeat. */
  readonly attackBeats?: readonly number[];
  readonly chord: ProgressionPracticeChord;
  /** Saved P8.1 card intent, kept as display metadata without changing Vault data. */
  readonly playbackChoice?: "SOURCE" | "GENERATED" | "CUSTOM";
  readonly sourceNeedsReview?: boolean;
  /** Exact selected MY voicing only. Lesson selections resolve later. */
  readonly voicing?: DetachedPracticeVoicing;
}

export type ProgressionPracticeSpan =
  | { readonly kind: "chord"; readonly startBeat: number; readonly durationBeats: number; readonly eventIndex: number }
  | { readonly kind: "rest"; readonly startBeat: number; readonly durationBeats: number };

export interface ProgressionVoicingPracticeSnapshot {
  readonly version: typeof PROGRESSION_VOICING_PRACTICE_SNAPSHOT_VERSION;
  readonly fingerprint: string;
  readonly source: {
    readonly kind: "vault";
    readonly reference: ProgressionPracticeSourceReference;
  };
  readonly selection: ProgressionVoicingSelection;
  /** Session-only current text practice policy; absent for MIDI-derived blocks. */
  readonly textDerivedPolicyId?: "text-defining-basic-full-v1";
  readonly key?: string;
  readonly bpm: number;
  /** Source time signature; never rewritten for presentation. */
  readonly meter: { readonly numerator: number; readonly denominator: 4 };
  /** Visual/count-in grouping in quarter-note beats, independent of source bars. */
  readonly practiceGroupBeats?: number;
  readonly lengthBeats: number;
  readonly events: readonly ProgressionPracticeEvent[];
  /** Continuous clock coverage; sounding event indices remain stable. */
  readonly spans: readonly ProgressionPracticeSpan[];
}

export type ProgressionVoicingPracticeSnapshots = Readonly<
  Partial<Record<ProgressionVoicingSelection, ProgressionVoicingPracticeSnapshot>>
>;

export interface ProgressionVoicingPracticeHandoff {
  readonly sourceReference: ProgressionPracticeSourceReference;
  readonly snapshots: ProgressionVoicingPracticeSnapshots;
  readonly initialSelection: ProgressionVoicingSelection;
}

export type ProgressionVoicingPracticeHandoffResult =
  | { readonly ok: true; readonly handoff: ProgressionVoicingPracticeHandoff }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "source-unavailable" | "invalid-source";
        readonly cause?: ProgressionPracticeSnapshotErrorCode;
      };
    };

export type ProgressionVoicingResolutionStatus =
  | "SUPPORTED"
  | "UNAVAILABLE"
  | "UNSUPPORTED_RULE"
  | "GENERATION_ERROR";

export interface ProgressionVoicingNoteFact {
  /** Exact MIDI pitch used for playback. */
  readonly midiNote: number;
  readonly pitchClass: number;
  readonly octave: number;
  /** `null` means the selected exact MY pitch is outside the canonical chord facts. */
  readonly degree: string | null;
}

export interface ResolvedProgressionPracticeVoicing {
  readonly origin: ProgressionVoicingSelection;
  /** Practice targets only; a product-approved slash Bass is separate. */
  readonly midiNotes: readonly number[];
  readonly referenceBassNote?: number;
  readonly bassNote?: number;
  readonly leftHandNotes?: readonly number[];
  readonly rightHandNotes?: readonly number[];
  readonly variant?: "A" | "B";
  readonly addedColorDegrees: readonly string[];
  readonly notes: readonly ProgressionVoicingNoteFact[];
  readonly explanation?: VoicingRuleExplanation;
}

export type ProgressionPracticeVoicingResolution =
  | {
      readonly eventId: string;
      readonly status: "SUPPORTED";
      readonly voicing: ResolvedProgressionPracticeVoicing;
      readonly reason?: never;
    }
  | {
      readonly eventId: string;
      readonly status: "UNAVAILABLE";
      readonly voicing?: never;
      readonly reason: "selected-source-unavailable";
    }
  | {
      readonly eventId: string;
      readonly status: "UNSUPPORTED_RULE";
      readonly voicing?: never;
      readonly reason: "no-approved-lesson-rule";
    }
  | {
      readonly eventId: string;
      readonly status: "GENERATION_ERROR";
      readonly voicing?: never;
      readonly reason: "candidate-generation-failed";
    };

export interface ProgressionPracticeVoicingPlan {
  readonly snapshotFingerprint: string;
  readonly selection: ProgressionVoicingSelection;
  readonly events: readonly ProgressionPracticeVoicingResolution[];
}

export type ProgressionPracticeSnapshotErrorCode =
  | "invalid-reference"
  | "invalid-selection"
  | "invalid-bpm"
  | "unsupported-meter"
  | "invalid-key"
  | "empty-progression"
  | "invalid-chord"
  | "invalid-timing"
  | "resource-budget"
  | "practice-capacity";

export interface ProgressionPracticeSnapshotError {
  readonly code: ProgressionPracticeSnapshotErrorCode;
  readonly message: string;
}

export type ProgressionPracticeSnapshotResult =
  | { readonly ok: true; readonly snapshot: ProgressionVoicingPracticeSnapshot }
  | { readonly ok: false; readonly error: ProgressionPracticeSnapshotError };
