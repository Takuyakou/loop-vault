import type {
  RootMotion,
  RootMotionAssistance,
  RootMotionCategory,
  RootMotionDirection,
  RootMotionExercise,
  RootMotionLevel,
} from "../domain";

export type RootMotionPracticeStatus = "ready" | "listening" | "identify" | "sing" | "play" | "review" | "completed" | "abandoned";

export interface RootMotionIdentifyAnswer {
  readonly direction?: RootMotionDirection;
  readonly category?: RootMotionCategory;
  readonly semitones?: number;
}

export interface RootMotionFirstAnswerEvidence {
  readonly submitted: RootMotionIdentifyAnswer;
  readonly expected: RootMotion;
  readonly directionCorrect: boolean;
  readonly categoryCorrect: boolean;
  readonly exactIntervalCorrect: boolean;
  readonly replayCountBeforeFirstAnswer: number;
  readonly answerAttempts: number;
  readonly assistance: RootMotionAssistance;
}

export interface RootMotionPracticeSnapshot {
  readonly status: RootMotionPracticeStatus;
  readonly listenCount: number;
  readonly hintLevel: 0 | 1 | 2 | 3 | 4;
  readonly answerAttempts: number;
  readonly firstAnswer?: RootMotionFirstAnswerEvidence;
  readonly rating?: "again" | "hard" | "good" | "easy";
}

export type RootMotionSessionResult =
  | { readonly ok: true; readonly snapshot: RootMotionPracticeSnapshot }
  | { readonly ok: false; readonly message: string; readonly snapshot: RootMotionPracticeSnapshot };

export class RootMotionPracticeSession {
  private snapshot: RootMotionPracticeSnapshot;

  constructor(private readonly exercise: RootMotionExercise) {
    this.snapshot = freeze({ status: "ready", listenCount: 0, hintLevel: 0, answerAttempts: 0 });
  }

  getSnapshot(): RootMotionPracticeSnapshot { return this.snapshot; }

  startListen(): RootMotionSessionResult {
    if (this.snapshot.status !== "ready" && this.snapshot.status !== "identify") return this.invalid("Listening is not available in the current phase.");
    this.snapshot = freeze({ ...this.snapshot, status: "listening", listenCount: this.snapshot.listenCount + 1 });
    return this.success();
  }

  completeListen(): RootMotionSessionResult {
    if (this.snapshot.status !== "listening") return this.invalid("No Root Motion playback is active.");
    this.snapshot = freeze({ ...this.snapshot, status: "identify" });
    return this.success();
  }

  cancelListen(): RootMotionSessionResult {
    if (this.snapshot.status !== "listening") return this.invalid("No Root Motion playback is active.");
    this.snapshot = freeze({ ...this.snapshot, status: this.snapshot.listenCount === 1 ? "ready" : "identify", listenCount: Math.max(0, this.snapshot.listenCount - 1) });
    return this.success();
  }

  nextHint(): RootMotionSessionResult {
    if (this.snapshot.status !== "identify" && this.snapshot.status !== "sing" && this.snapshot.status !== "play") return this.invalid("Hints are available after listening.");
    this.snapshot = freeze({ ...this.snapshot, hintLevel: Math.min(4, this.snapshot.hintLevel + 1) as 0 | 1 | 2 | 3 | 4 });
    return this.success();
  }

  submitIdentify(answer: RootMotionIdentifyAnswer): RootMotionSessionResult {
    if (this.snapshot.status !== "identify") return this.invalid("Identify is not available in the current phase.");
    const expected = this.exercise.motions[0];
    if (!expected) return this.invalid("The exercise has no Root Motion to identify.");
    const levelError = validateAnswerForLevel(this.exercise.level, answer);
    if (levelError) return this.invalid(levelError);
    const attempts = this.snapshot.answerAttempts + 1;
    const firstAnswer = this.snapshot.firstAnswer ?? freeze({
      submitted: freeze({ ...answer }), expected,
      directionCorrect: answer.direction === expected.direction,
      categoryCorrect: answer.category === expected.category,
      exactIntervalCorrect: answer.semitones === expected.semitones,
      replayCountBeforeFirstAnswer: this.snapshot.listenCount - 1,
      answerAttempts: attempts,
      assistance: assistanceFromHint(this.snapshot.hintLevel),
    });
    this.snapshot = freeze({ ...this.snapshot, status: "sing", answerAttempts: attempts, firstAnswer });
    return this.success();
  }

  continueToPlay(): RootMotionSessionResult {
    if (this.snapshot.status !== "sing") return this.invalid("Complete the Identify and Sing stages first.");
    this.snapshot = freeze({ ...this.snapshot, status: "play" });
    return this.success();
  }

  completePlay(): RootMotionSessionResult {
    if (this.snapshot.status !== "play") return this.invalid("Play is not active.");
    this.snapshot = freeze({ ...this.snapshot, status: "review" });
    return this.success();
  }

  rate(rating: "again" | "hard" | "good" | "easy"): RootMotionSessionResult {
    if (this.snapshot.status !== "review") return this.invalid("Review is not available yet.");
    this.snapshot = freeze({ ...this.snapshot, status: "completed", rating });
    return this.success();
  }

  abandon(): RootMotionSessionResult {
    if (this.snapshot.status === "completed" || this.snapshot.status === "abandoned") return this.invalid("The session is already closed.");
    this.snapshot = freeze({ ...this.snapshot, status: "abandoned" });
    return this.success();
  }

  private success(): RootMotionSessionResult { return Object.freeze({ ok: true, snapshot: this.snapshot }); }
  private invalid(message: string): RootMotionSessionResult { return Object.freeze({ ok: false, message, snapshot: this.snapshot }); }
}

function validateAnswerForLevel(level: RootMotionLevel, answer: RootMotionIdentifyAnswer): string | undefined {
  if (answer.direction !== "same" && answer.direction !== "up" && answer.direction !== "down") return "Choose a direction.";
  if (level >= 2 && !["same", "second", "third", "fourth", "tritone", "fifth"].includes(String(answer.category))) return "Choose an interval category.";
  const semitones = answer.semitones;
  if (level >= 3 && (semitones === undefined || !Number.isInteger(semitones) || semitones < 0 || semitones > 7)) return "Choose the exact interval.";
  return undefined;
}

function assistanceFromHint(hintLevel: 0 | 1 | 2 | 3 | 4): RootMotionAssistance {
  return hintLevel === 0 ? "independent" : hintLevel === 4 ? "revealed" : "assisted";
}

function freeze<T>(value: T): T { return Object.freeze(value); }