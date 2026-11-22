import type { ChordQuality } from "../../../types";
import type { AdvancedBlock, AdvancedCourseLevel, ProgressionFamily } from "./levels";

export type { AdvancedBlock, AdvancedCourseLevel, ProgressionFamily } from "./levels";

/**
 * P23-45 advanced course (Lv4–8 and 総合確認) items and evidence.
 *
 * The advanced bank is described by *items*, not by a fixed count per level: an attempt records the
 * exact item ids it presents, so the mid-card start (Lv5), the missing-key recheck (Lv6), the three
 * Lv8 groups and the three capstone parts can each be resumed and evaluated without inventing
 * questions at read time.
 */
export type AdvancedItemKind =
  | "placement"
  | "progression"
  | "transpose"
  | "vocab"
  | "capstone-name"
  | "capstone-progression"
  | "capstone-sight";

export type AdvancedPrompt = "name" | "ear";

/** One chord inside a question. `requiredPitchClasses`/`allowedPitchClasses` are the answer rule. */
export interface AdvancedChord {
  readonly root: number;
  readonly quality: ChordQuality;
  readonly label: string;
  readonly bassPitchClass?: number;
  readonly requiredPitchClasses: readonly number[];
  readonly allowedPitchClasses: readonly number[];
  readonly referenceNotes: readonly number[];
}

export interface AdvancedItem {
  readonly id: string;
  readonly level: AdvancedCourseLevel;
  readonly block: AdvancedBlock;
  /** The named set inside a level (Lv5 `progressions`/`mid`, Lv6 `keys`, Lv8 group id, capstone part). */
  readonly setId: string;
  readonly kind: AdvancedItemKind;
  /** The level part this item belongs to (Lv8 `six:name`, capstone `name`); used by the report. */
  readonly part?: string;
  readonly group?: string;
  readonly family?: ProgressionFamily;
  readonly prompt: AdvancedPrompt;
  readonly label: string;
  readonly detail?: string;
  readonly keyRoot?: number;
  readonly chords: readonly AdvancedChord[];
  /** A short cadence that establishes the key before an ear question (not the answer). */
  readonly referenceChords?: readonly AdvancedChord[];
  /** P23-56: a recolour question's plain progression, played on request to compare (not the answer, not a hint). */
  readonly plainChords?: readonly AdvancedChord[];
  /** 0-based card the learner starts from (Lv5 mid-card questions). */
  readonly startIndex?: number;
  /** Whether the chord cards are visible while answering (false for ear questions). */
  readonly revealCards: boolean;
  /** Capstone sight reading: the tempo band the learner picked, in BPM. */
  readonly tempoBpm?: number;
  /** Number of reference playbacks allowed by the question itself (0 or 2 per P23-45). */
  readonly allowedPlaybacks: number;
}

/** Per-card or per-beat evidence of a progression/sight answer. */
export interface AdvancedStep {
  readonly notes: readonly number[];
  readonly ok: boolean;
  readonly speedMs?: number;
}

export type AdvancedResult = "correct" | "wrong" | "incomplete" | "no-input" | "invalid";

export interface AdvancedTrial {
  readonly trialId: string;
  readonly attemptId: string;
  readonly block: AdvancedBlock;
  readonly setId: string;
  readonly itemId: string;
  readonly level: AdvancedCourseLevel;
  readonly result: AdvancedResult;
  /** Per-card (progression) or per-beat (capstone sight) evidence. Empty for single-chord items. */
  readonly steps: readonly AdvancedStep[];
  readonly sealedNotes: readonly number[];
  readonly bassOk?: boolean;
  readonly speedMs?: number;
  /** Capstone sight: the BPM the chart was displayed, counted and judged at. */
  readonly tempoBpm?: number;
  readonly hintUsed: boolean;
  readonly selfConfirmed: boolean;
  readonly midiConfirmed: boolean;
  /** Free practice: recorded for the learner, never counted toward a formal pass. */
  readonly practice: boolean;
  readonly startedAt: string;
  readonly sealedAt: string;
}

export interface AdvancedAttempt {
  readonly level: AdvancedCourseLevel;
  readonly block: AdvancedBlock;
  readonly setId: string;
  readonly attemptId: string;
  readonly startedAt: string;
  /** `midi` can reach a formal pass; `self` is the separate self-confirmation track. */
  readonly mode: "midi" | "self";
  readonly practice: boolean;
  readonly group?: string;
  /** The exact questions of this attempt, in presentation order. */
  readonly itemIds: readonly string[];
}

export interface AdvancedStore {
  readonly schema: "loopvault-guided-course-advanced";
  readonly version: 1;
  readonly bankVersion: string;
  readonly attempts: readonly AdvancedAttempt[];
  readonly trials: readonly AdvancedTrial[];
  /** The official attempt in progress (free practice never replaces it). */
  readonly active?: string;
  /** The free-practice attempt in progress. */
  readonly free?: string;
  /**
   * P23-47: per-level round boundaries. Only attempts started at or after a level's boundary count
   * toward that level's current pass, so restarting never re-uses old correct answers.
   */
  readonly rounds?: Readonly<Record<string, { readonly startedAt: string }>>;
  /** Levels passed in any earlier round; kept so a restart does not erase the achievement history. */
  readonly achievements?: readonly AdvancedCourseLevel[];
}

export const ADVANCED_STORE_SCHEMA = "loopvault-guided-course-advanced" as const;
export const ADVANCED_STORE_VERSION = 1 as const;
/** Raised only when the authored material changes; old evidence is kept, never quarantined. */
export const ADVANCED_BANK_VERSION = "p23-45.advanced.v1";
