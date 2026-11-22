/** P23-40 course store types (schema v1; `attemptId`/`block` are the course's additive evidence keys). */
export type CourseLevel = 1 | 2 | 3;
export type CourseBlock = "sameDay" | "delay";
export type CourseTrialResult = "correct" | "wrong" | "incomplete" | "no-input" | "invalid";
export type CourseInvalidReason =
  | "disconnected"
  | "prepare-failed"
  | "clock-jump"
  | "capability"
  | "stall"
  | "hidden";

export interface CourseTrial {
  readonly trialId: string;
  /** Groups one evaluation attempt; the official evaluation never mixes attempts. */
  readonly attemptId: string;
  readonly block: CourseBlock;
  readonly itemId: string;
  readonly level: CourseLevel;
  readonly quality: string;
  readonly root: number;
  readonly result: CourseTrialResult;
  readonly invalidReason?: CourseInvalidReason;
  readonly sealedNotes: readonly number[];
  readonly speedMs?: number;
  readonly hintUsed: boolean;
  readonly selfConfirmed: boolean;
  readonly midiConfirmed: boolean;
  readonly startedAt: string;
  readonly sealedAt: string;
}

export interface ActiveAttempt {
  readonly level: CourseLevel;
  readonly block: CourseBlock;
  readonly attemptId: string;
  readonly startedAt: string;
  /** `midi` can reach a formal pass; `self` is the separate self-confirmation track. */
  readonly mode: "midi" | "self";
}

export interface CourseStore {
  readonly schema: "loopvault-guided-course";
  readonly version: 1;
  readonly bankVersion: string;
  readonly policyVersion: string;
  readonly pairId: string;
  readonly trials: readonly CourseTrial[];
  readonly active?: ActiveAttempt;
  /**
   * P23-47: a level restarted "from the beginning" gets a new round boundary. Only trials sealed at
   * or after it count toward that level, so old correct answers never complete the new round. When a
   * level has no entry, every trial counts (existing data is unchanged).
   */
  readonly rounds?: Readonly<Record<string, { readonly startedAt: string }>>;
}

export const COURSE_STORE_SCHEMA = "loopvault-guided-course" as const;
export const COURSE_STORE_VERSION = 1 as const;
