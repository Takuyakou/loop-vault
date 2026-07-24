import type {
  DojoPracticeLevel,
  PracticeAction,
  PracticeLeniency,
  PracticeMode,
  PracticeSessionState,
} from "../practice";
import type {
  KeySignature,
  PracticeTargetPlan,
  TransposedPracticeEvent,
} from "../practiceTransposition";
import type { SavedProgressionBlock } from "../types";
import type {
  PracticeTargetSource,
  StyleVoicingMatchMode,
} from "../voicingPractice";

export interface MixProgressionReference {
  readonly ideaId: string;
  readonly blockId: string;
}

export interface MixSessionConfig {
  readonly references: readonly MixProgressionReference[];
  readonly level: DojoPracticeLevel;
  readonly mode: PracticeMode;
  readonly leniency: PracticeLeniency;
  readonly targetSource: PracticeTargetSource;
  readonly styleMatchMode?: StyleVoicingMatchMode;
  readonly allowUnsupportedFallback: boolean;
  readonly cycles: 1 | 2 | 3;
  readonly bpm: number;
}

export interface MixProgressionCandidate {
  readonly reference: MixProgressionReference;
  readonly title: string;
  readonly block?: SavedProgressionBlock;
  readonly effectiveKeySignature?: string;
}

export interface MixProgressionSnapshot {
  readonly reference: MixProgressionReference;
  readonly progressionFingerprint: string;
  readonly contentFingerprint: string;
  readonly title: string;
  readonly sourceKey?: KeySignature;
  readonly events: readonly TransposedPracticeEvent[];
  readonly targetPlan: PracticeTargetPlan;
}

export type MixSnapshotDriftReason = "missing" | "fingerprint-changed";

export interface MixSnapshotDrift {
  readonly reference: MixProgressionReference;
  readonly title: string;
  readonly reason: MixSnapshotDriftReason;
}

export type MixPreflightErrorCode =
  | "selection-count"
  | "duplicate-selection"
  | "missing-block"
  | "empty-progression"
  | "invalid-chord"
  | "missing-key"
  | "unsupported-key"
  | "roman-numeral-unavailable"
  | "flow-time-signature"
  | "flow-timing"
  | "target-plan-unavailable"
  | "target-plan-unsupported"
  | "fingerprint-unavailable";

export interface MixPreflightError {
  readonly code: MixPreflightErrorCode;
  readonly reference?: MixProgressionReference;
  readonly title?: string;
  readonly detail?: string;
}

export type MixPreflightResult =
  | {
      readonly ok: true;
      readonly snapshots: readonly MixProgressionSnapshot[];
    }
  | {
      readonly ok: false;
      readonly errors: readonly MixPreflightError[];
    };

export interface ProgressionBagState {
  readonly remainingReferences: readonly MixProgressionReference[];
  readonly completedReferences: readonly MixProgressionReference[];
  readonly lastDrawnReference?: MixProgressionReference;
  readonly seed: number;
}

export interface ProgressionBagDraw {
  readonly reference?: MixProgressionReference;
  readonly nextState: ProgressionBagState;
}

export interface MixOrderItem {
  readonly reference: MixProgressionReference;
  readonly cycle: number;
  readonly progressionIndex: number;
}

export type MixProgressionResultValue = "clean" | "dirty";

export interface MixProgressionResult {
  readonly reference: MixProgressionReference;
  readonly title: string;
  readonly cycle: number;
  readonly result: MixProgressionResultValue;
}

export interface MixSessionSummary {
  readonly clean: readonly MixProgressionSnapshot[];
  readonly dirty: readonly MixProgressionSnapshot[];
  readonly cycles: number;
}

export interface MixSessionState {
  readonly status:
    | "ready"
    | "running"
    | "between-progressions"
    | "paused"
    | "summary"
    | "completed";
  readonly config: MixSessionConfig;
  readonly snapshots: readonly MixProgressionSnapshot[];
  readonly order: readonly MixOrderItem[];
  readonly currentOrderIndex: number;
  readonly results: readonly MixProgressionResult[];
  readonly currentPracticeSession?: PracticeSessionState;
  readonly sessionSeed: number;
}

export type MixSessionAction =
  | {
      readonly type: "START_CURRENT";
      readonly requiredAttackRevision?: number;
    }
  | {
      readonly type: "PRACTICE_ACTION";
      readonly action: PracticeAction;
    }
  | { readonly type: "PAUSE" }
  | {
      readonly type: "RESUME";
      readonly requiredAttackRevision?: number;
    }
  | {
      readonly type: "RESTART_CURRENT";
      readonly requiredAttackRevision?: number;
    }
  | { readonly type: "END" };
