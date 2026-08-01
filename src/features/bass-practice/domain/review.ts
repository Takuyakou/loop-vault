import { REVIEW_QUEUE_POLICY_VERSION } from "./constants";
import type {
  HintLevel,
  PracticeAttempt,
  PracticeIssue,
  PracticeRating,
  PracticeExercise,
  ReviewQueueItem,
} from "./types";

export interface IndependentSuccessFacts {
  readonly rating?: PracticeRating;
  readonly hintLevel: HintLevel;
  readonly singSkipped: boolean;
  readonly singGateCompleted: boolean;
}

export function deriveIndependentSuccess(facts: IndependentSuccessFacts): boolean {
  return (facts.rating === "good" || facts.rating === "easy")
    && facts.hintLevel <= 2
    && !facts.singSkipped
    && facts.singGateCompleted;
}

export function createCompletedAttempt(input: {
  readonly id: string;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly listenCount: number;
  readonly hintLevel: HintLevel;
  readonly singSkipped: boolean;
  readonly singGateCompleted: boolean;
  readonly rating: PracticeRating;
  readonly mainIssue?: PracticeIssue;
  readonly responseLatencyMs?: number;
  readonly transferOfAttemptId?: string;
  readonly exercise: PracticeExercise;
}): PracticeAttempt {
  assertIsoDate(input.startedAt, "startedAt");
  assertIsoDate(input.completedAt, "completedAt");
  if (input.completedAt < input.startedAt) {
    throw new RangeError("Attempt completion cannot precede its start.");
  }
  if (!Number.isInteger(input.listenCount) || input.listenCount < 1) {
    throw new RangeError("Completed attempt listen count must be positive.");
  }
  const facts: IndependentSuccessFacts = {
    rating: input.rating,
    hintLevel: input.hintLevel,
    singSkipped: input.singSkipped,
    singGateCompleted: input.singGateCompleted,
  };
  return deepFreeze({
    id: input.id,
    exerciseId: input.exercise.id,
    sessionId: input.sessionId,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    listenCount: input.listenCount,
    hintLevel: input.hintLevel,
    singSkipped: input.singSkipped,
    singGateCompleted: input.singGateCompleted,
    responseLatencyMs: input.responseLatencyMs,
    rating: input.rating,
    mainIssue: input.mainIssue,
    independentSuccess: deriveIndependentSuccess(facts),
    transferOfAttemptId: input.transferOfAttemptId,
    exerciseSnapshot: input.exercise,
  });
}

export function deriveReviewQueue(
  attempts: readonly PracticeAttempt[],
  clockDate: string,
): readonly ReviewQueueItem[] {
  const clock = parseIsoDate(clockDate, "clockDate");
  const unique = new Map<string, ReviewQueueItem>();
  const normalizedAttempts = [...attempts].sort((left, right) => (
    compareText(left.id, right.id)
  ));
  for (const attempt of normalizedAttempts) {
    if (!attempt.completedAt || !attempt.rating) continue;
    if (attempt.independentSuccess !== deriveIndependentSuccess(attempt)) {
      throw new Error(`Attempt ${attempt.id} has a non-canonical independent success value.`);
    }
    const policy = queuePolicy(attempt);
    const reason = attempt.rating;
    const dueAt = addUtcDays(clock, policy.days).toISOString();
    const item: ReviewQueueItem = deepFreeze({
      exerciseId: attempt.exerciseId,
      dueAt,
      reason,
      difficultyAdjustment: policy.difficultyAdjustment,
      sourceAttemptId: attempt.id,
      stableOrder: policy.stableOrder,
      schedule: policy.schedule,
    });
    const key = `${item.sourceAttemptId}:${item.reason}`;
    if (unique.has(key)) throw new Error(`Duplicate review queue item: ${key}`);
    unique.set(key, item);
  }
  return Object.freeze([...unique.values()].sort(compareQueueItems));
}

export function compareQueueItems(
  left: ReviewQueueItem,
  right: ReviewQueueItem,
): number {
  return compareText(left.dueAt, right.dueAt)
    || left.stableOrder - right.stableOrder
    || compareText(left.exerciseId, right.exerciseId)
    || compareText(left.sourceAttemptId, right.sourceAttemptId);
}

function queuePolicy(attempt: PracticeAttempt): {
  readonly days: number;
  readonly difficultyAdjustment: -1 | 0 | 1;
  readonly stableOrder: number;
  readonly schedule: ReviewQueueItem["schedule"];
} {
  switch (attempt.rating) {
    case "again":
      {
        const questionsLater = (2 + (
          attempt.listenCount
          + attempt.hintLevel
          + (attempt.mainIssue ? 1 : 0)
        ) % 2) as 2 | 3;
        return {
          days: 0,
          difficultyAdjustment: -1,
          stableOrder: questionsLater,
          schedule: {
            kind: "current-session-offset",
            questionsLater,
            tempoMultiplier: 1,
          },
        };
      }
    case "hard":
      return {
        days: 0,
        difficultyAdjustment: -1,
        stableOrder: 9_000,
        schedule: {
          kind: "session-boundary",
          position: "tail-or-next-head",
          tempoMultiplier: 0.9,
        },
      };
    case "good":
      return {
        days: 1,
        difficultyAdjustment: 0,
        stableOrder: 0,
        schedule: {
          kind: "variation",
          timing: "next-session-or-next-day",
          variation: "different-key",
          tempoMultiplier: 1,
        },
      };
    case "easy":
      return {
        days: 3,
        difficultyAdjustment: 1,
        stableOrder: 0,
        schedule: {
          kind: "spaced-transfer",
          intervalDays: 3,
          preferTransfer: true,
          tempoMultiplier: 1,
        },
      };
    default:
      throw new Error(`Completed attempt ${attempt.id} has no rating.`);
  }
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + (days * 86_400_000));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseIsoDate(value: string, name: string): Date {
  assertIsoDate(value, name);
  return new Date(value);
}

function assertIsoDate(value: string, name: string): void {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new RangeError(`${name} must be a canonical ISO-8601 timestamp.`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

export { REVIEW_QUEUE_POLICY_VERSION };
