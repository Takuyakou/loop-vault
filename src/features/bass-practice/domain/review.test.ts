import { describe, expect, it } from "vitest";
import {
  REVIEW_QUEUE_POLICY_VERSION,
  createCompletedAttempt,
  deriveIndependentSuccess,
  deriveReviewQueue,
  type HintLevel,
  type PracticeAttempt,
  type PracticeRating,
} from ".";
import { generatedExercise } from "./testFixtures";

function attempt(
  id: string,
  rating: PracticeRating,
  overrides: Partial<PracticeAttempt> = {},
): PracticeAttempt {
  const created = createCompletedAttempt({
    id,
    sessionId: "session-1",
    startedAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-01T00:01:00.000Z",
    listenCount: 1,
    hintLevel: 0,
    singSkipped: false,
    singGateCompleted: true,
    rating,
    exercise: generatedExercise({ seed: `exercise-${id}` }),
  });
  return { ...created, ...overrides };
}

describe("self-rated independent success", () => {
  it.each([
    ["again", 0, false, true, false],
    ["hard", 0, false, true, false],
    ["good", 0, false, true, true],
    ["easy", 2, false, true, true],
    ["good", 3, false, true, false],
    ["easy", 4, false, true, false],
    ["good", 0, true, true, false],
    ["good", 0, false, false, false],
  ] as const)(
    "%s at Hint %i (skipped=%s gate=%s) returns %s",
    (rating, hintLevel, singSkipped, singGateCompleted, expected) => {
      expect(deriveIndependentSuccess({
        rating,
        hintLevel: hintLevel as HintLevel,
        singSkipped,
        singGateCompleted,
      })).toBe(expected);
    },
  );

  it("computes the canonical value while constructing a completed attempt", () => {
    expect(attempt("good", "good").independentSuccess).toBe(true);
    expect(createCompletedAttempt({
      id: "hint-3",
      sessionId: "session-1",
      startedAt: "2026-08-01T00:00:00.000Z",
      completedAt: "2026-08-01T00:01:00.000Z",
      listenCount: 2,
      hintLevel: 3,
      singSkipped: false,
      singGateCompleted: true,
      rating: "easy",
      mainIssue: "recall",
      exercise: generatedExercise(),
    }).independentSuccess).toBe(false);
  });
});

describe("review queue policy", () => {
  it("has an explicit version", () => {
    expect(REVIEW_QUEUE_POLICY_VERSION).toBe(1);
  });

  it("is deterministic across input ordering and uses the supplied UTC clock", () => {
    const attempts = [
      attempt("again", "again"),
      attempt("hard", "hard"),
      attempt("good", "good"),
      attempt("easy", "easy"),
    ];
    const clock = "2026-08-02T09:00:00.000Z";
    const first = deriveReviewQueue(attempts, clock);
    const second = deriveReviewQueue([...attempts].reverse(), clock);
    expect(second).toEqual(first);
    expect(first).toHaveLength(4);
    expect(first.map((item) => item.reason).sort()).toEqual([
      "again", "easy", "good", "hard",
    ]);
    expect(first.find((item) => item.reason === "again")).toEqual(
      expect.objectContaining({
        dueAt: "2026-08-02T09:00:00.000Z",
        difficultyAdjustment: -1,
        schedule: expect.objectContaining({
          kind: "current-session-offset",
          questionsLater: expect.any(Number),
        }),
      }),
    );
    expect(first.find((item) => item.reason === "good")?.dueAt)
      .toBe("2026-08-03T09:00:00.000Z");
    expect(first.find((item) => item.reason === "hard")?.schedule).toEqual({
      kind: "session-boundary",
      position: "tail-or-next-head",
      tempoMultiplier: 0.9,
    });
    expect(first.find((item) => item.reason === "good")?.schedule).toEqual({
      kind: "variation",
      timing: "next-session-or-next-day",
      variation: "different-key",
      tempoMultiplier: 1,
    });
    expect(first.find((item) => item.reason === "easy")?.dueAt)
      .toBe("2026-08-05T09:00:00.000Z");
    expect(first.find((item) => item.reason === "easy")?.schedule).toEqual({
      kind: "spaced-transfer",
      intervalDays: 3,
      preferTransfer: true,
      tempoMultiplier: 1,
    });
  });

  it("does not use attempt IDs to choose Again offset or scheduling order", () => {
    const original = attempt("original-id", "again", { listenCount: 2, hintLevel: 1 });
    const renamed: PracticeAttempt = { ...original, id: "completely-different-id" };
    const clock = "2026-08-02T09:00:00.000Z";
    const first = deriveReviewQueue([original], clock)[0];
    const second = deriveReviewQueue([renamed], clock)[0];
    expect(second.schedule).toEqual(first.schedule);
    expect(second.stableOrder).toBe(first.stableOrder);
    expect(first.schedule).toEqual({
      kind: "current-session-offset",
      questionsLater: 3,
      tempoMultiplier: 1,
    });
  });

  it("rejects a non-canonical persisted independent-success value", () => {
    const corrupt = attempt("corrupt", "again", { independentSuccess: true });
    expect(() => deriveReviewQueue([corrupt], "2026-08-02T00:00:00.000Z"))
      .toThrow("non-canonical independent success");
  });

  it("rejects non-canonical clock text instead of reading the wall clock", () => {
    expect(() => deriveReviewQueue([], "2026-08-02"))
      .toThrow("canonical ISO-8601");
  });
});
