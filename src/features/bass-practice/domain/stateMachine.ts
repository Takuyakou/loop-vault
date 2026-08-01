import { nextHintLevel } from "./hints";
import type {
  HintLevel,
  PracticeIssue,
  PracticeRating,
} from "./types";

export type PracticeStatus =
  | "setup"
  | "ready"
  | "listening"
  | "recall"
  | "singing"
  | "thinking"
  | "playing"
  | "review"
  | "transfer-offer"
  | "transfer"
  | "completed"
  | "abandoned";

export type PlaybackReturnStatus = "recall" | "thinking";

export interface DegreePracticeState {
  readonly status: PracticeStatus;
  readonly singEnabled: boolean;
  readonly listenLimit: number;
  readonly listenCount: number;
  readonly hintLevel: HintLevel;
  readonly maximumHintLevel: HintLevel;
  readonly playbackReturnStatus?: PlaybackReturnStatus;
  readonly singSkipped: boolean;
  readonly singGateCompleted: boolean;
  readonly singGateAvailableAtMs?: number;
  readonly rating?: PracticeRating;
  readonly mainIssue?: PracticeIssue;
  readonly transferAttempted: boolean;
}

export type PracticeAction =
  | { readonly type: "CONFIGURE" }
  | { readonly type: "START_LISTEN" }
  | { readonly type: "PLAYBACK_ENDED" }
  | { readonly type: "REPLAY" }
  | {
      readonly type: "CONTINUE_RECALL";
      readonly nowMs: number;
      readonly phraseDurationMs: number;
    }
  | { readonly type: "COMPLETE_SING"; readonly nowMs: number }
  | { readonly type: "SKIP_SING" }
  | { readonly type: "NEXT_HINT" }
  | { readonly type: "START_PLAY" }
  | { readonly type: "COMPLETE_PLAY" }
  | {
      readonly type: "RATE";
      readonly rating: PracticeRating;
      readonly mainIssue?: PracticeIssue;
    }
  | { readonly type: "START_TRANSFER" }
  | { readonly type: "DECLINE_TRANSFER" }
  | { readonly type: "COMPLETE_TRANSFER" }
  | { readonly type: "ABANDON" };

export type PracticeTransitionErrorCode =
  | "invalid-transition"
  | "replay-limit"
  | "sing-gate-pending"
  | "invalid-time";

export type PracticeTransitionResult =
  | { readonly ok: true; readonly state: DegreePracticeState }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: PracticeTransitionErrorCode;
        readonly message: string;
      };
    };

export function createDegreePracticeState(options: {
  readonly singEnabled: boolean;
  readonly listenLimit: number;
  readonly maximumHintLevel?: HintLevel;
}): DegreePracticeState {
  if (!Number.isInteger(options.listenLimit) || options.listenLimit < 1) {
    throw new RangeError("Listen limit must be a positive integer.");
  }
  const maximumHintLevel = options.maximumHintLevel ?? 4;
  if (!Number.isInteger(maximumHintLevel) || maximumHintLevel < 0 || maximumHintLevel > 4) {
    throw new RangeError("Maximum hint level must be between 0 and 4.");
  }
  return freezeState({
    status: "setup",
    singEnabled: options.singEnabled,
    listenLimit: options.listenLimit,
    listenCount: 0,
    hintLevel: 0,
    maximumHintLevel,
    singSkipped: false,
    singGateCompleted: false,
    transferAttempted: false,
  });
}

export function reduceDegreePractice(
  state: DegreePracticeState,
  action: PracticeAction,
): PracticeTransitionResult {
  if (action.type === "ABANDON") {
    return state.status === "completed" || state.status === "abandoned"
      ? invalidTransition(state, action.type)
      : success({
          ...state,
          status: "abandoned",
          playbackReturnStatus: undefined,
          singGateAvailableAtMs: undefined,
        });
  }
  if (action.type === "CONFIGURE" && state.status === "setup") {
    return success({ ...state, status: "ready" });
  }
  if (action.type === "START_LISTEN" && state.status === "ready") {
    return success({
      ...state,
      status: "listening",
      listenCount: 1,
      playbackReturnStatus: "recall",
    });
  }
  if (action.type === "PLAYBACK_ENDED" && state.status === "listening") {
    if (!state.playbackReturnStatus) {
      return failure("invalid-transition", "Listening state has no typed return stage.");
    }
    return success({
      ...state,
      status: state.playbackReturnStatus,
      playbackReturnStatus: undefined,
    });
  }
  if (action.type === "REPLAY" && canReplayFrom(state.status)) {
    if (state.listenCount >= state.listenLimit) {
      return failure("replay-limit", "The exercise listen limit has been reached.");
    }
    return success({
      ...state,
      status: "listening",
      listenCount: state.listenCount + 1,
      playbackReturnStatus: state.status,
    });
  }
  if (action.type === "CONTINUE_RECALL" && state.status === "recall") {
    if (!state.singEnabled) return success({ ...state, status: "thinking" });
    if (!isFiniteNonNegative(action.nowMs) || !isFiniteNonNegative(action.phraseDurationMs)) {
      return failure("invalid-time", "Singing gate times must be finite and non-negative.");
    }
    return success({
      ...state,
      status: "singing",
      singGateAvailableAtMs: action.nowMs + singingGateDurationMs(action.phraseDurationMs),
    });
  }
  if (action.type === "COMPLETE_SING" && state.status === "singing") {
    if (!isFiniteNonNegative(action.nowMs)) {
      return failure("invalid-time", "Singing completion time must be finite and non-negative.");
    }
    if (
      state.singGateAvailableAtMs === undefined
      || action.nowMs < state.singGateAvailableAtMs
    ) {
      return failure("sing-gate-pending", "The minimum singing dwell has not elapsed.");
    }
    return success({
      ...state,
      status: "thinking",
      singGateCompleted: true,
      singGateAvailableAtMs: undefined,
    });
  }
  if (action.type === "SKIP_SING" && state.status === "singing") {
    return success({
      ...state,
      status: "thinking",
      singSkipped: true,
      singGateCompleted: false,
      singGateAvailableAtMs: undefined,
    });
  }
  if (action.type === "NEXT_HINT" && canUseHintIn(state.status)) {
    return success({
      ...state,
      hintLevel: nextHintLevel(state.hintLevel, state.maximumHintLevel),
    });
  }
  if (action.type === "START_PLAY" && state.status === "thinking") {
    return success({ ...state, status: "playing" });
  }
  if (action.type === "COMPLETE_PLAY" && state.status === "playing") {
    return success({ ...state, status: "review" });
  }
  if (action.type === "RATE" && state.status === "review") {
    const transferEligible = !state.transferAttempted
      && (action.rating === "good" || action.rating === "easy");
    return success({
      ...state,
      status: transferEligible ? "transfer-offer" : "completed",
      rating: action.rating,
      mainIssue: action.mainIssue,
    });
  }
  if (action.type === "START_TRANSFER" && state.status === "transfer-offer") {
    return success({ ...state, status: "transfer", transferAttempted: true });
  }
  if (action.type === "DECLINE_TRANSFER" && state.status === "transfer-offer") {
    return success({ ...state, status: "completed" });
  }
  if (action.type === "COMPLETE_TRANSFER" && state.status === "transfer") {
    return success({
      ...state,
      status: "review",
      rating: undefined,
      mainIssue: undefined,
    });
  }
  return invalidTransition(state, action.type);
}

export function restoreDegreePracticeState(
  candidate: DegreePracticeState,
): DegreePracticeState {
  const statuses: readonly PracticeStatus[] = [
    "setup", "ready", "listening", "recall", "singing", "thinking",
    "playing", "review", "transfer-offer", "transfer", "completed", "abandoned",
  ];
  if (!statuses.includes(candidate.status)) throw new Error("Unknown practice state.");
  if (
    typeof candidate.singEnabled !== "boolean"
    || typeof candidate.singSkipped !== "boolean"
    || typeof candidate.singGateCompleted !== "boolean"
    || typeof candidate.transferAttempted !== "boolean"
  ) {
    throw new Error("Practice state boolean facts are invalid.");
  }
  if (
    !Number.isInteger(candidate.listenLimit)
    || candidate.listenLimit < 1
    || !Number.isInteger(candidate.listenCount)
    || candidate.listenCount < 0
    || candidate.listenCount > candidate.listenLimit
  ) {
    throw new Error("Practice listen counters are invalid.");
  }
  if (
    !Number.isInteger(candidate.hintLevel)
    || !Number.isInteger(candidate.maximumHintLevel)
    || candidate.hintLevel < 0
    || candidate.maximumHintLevel > 4
    || candidate.hintLevel > candidate.maximumHintLevel
  ) {
    throw new Error("Practice hint counters are invalid.");
  }
  if (candidate.status === "completed" && candidate.rating === undefined) {
    throw new Error("Completed practice requires a self rating.");
  }
  validatePlaybackReturn(candidate);
  validateReachableCounters(candidate);
  validateSingingFacts(candidate);
  validateReviewAndTransferFacts(candidate);
  return freezeState({ ...candidate });
}

export function singingGateDurationMs(phraseDurationMs: number): number {
  if (!isFiniteNonNegative(phraseDurationMs)) {
    throw new RangeError("Phrase duration must be finite and non-negative.");
  }
  return Math.min(8_000, Math.max(1_000, phraseDurationMs * 0.8));
}

function canReplayFrom(status: PracticeStatus): status is PlaybackReturnStatus {
  return status === "recall" || status === "thinking";
}

function validatePlaybackReturn(state: DegreePracticeState): void {
  const validReturns: readonly PlaybackReturnStatus[] = ["recall", "thinking"];
  if (state.status === "listening") {
    if (!state.playbackReturnStatus || !validReturns.includes(state.playbackReturnStatus)) {
      throw new Error("Listening state requires a typed playback return stage.");
    }
  } else if (state.playbackReturnStatus !== undefined) {
    throw new Error("Only listening state may retain a playback return stage.");
  }
}

function validateReachableCounters(state: DegreePracticeState): void {
  if ((state.status === "setup" || state.status === "ready") && state.listenCount !== 0) {
    throw new Error("Setup and ready states cannot contain listens.");
  }
  if (state.status !== "setup" && state.status !== "ready" && state.status !== "abandoned") {
    if (state.listenCount < 1) throw new Error("Active practice after ready requires a listen.");
  }
  if (state.hintLevel > 0 && state.listenCount === 0) {
    throw new Error("Hints cannot be used before the first listen.");
  }
  if ((state.status === "setup" || state.status === "ready") && state.hintLevel !== 0) {
    throw new Error("Setup and ready states cannot contain hints.");
  }
}

function validateSingingFacts(state: DegreePracticeState): void {
  if (state.singSkipped && state.singGateCompleted) {
    throw new Error("Singing cannot be both skipped and completed.");
  }
  const activelySinging = state.status === "singing";
  if (!state.singEnabled) {
    if (
      activelySinging
      || state.singSkipped
      || state.singGateCompleted
      || state.singGateAvailableAtMs !== undefined
    ) {
      throw new Error("Sing-disabled practice cannot contain singing facts.");
    }
    return;
  }
  if (activelySinging) {
    if (
      state.singSkipped
      || state.singGateCompleted
      || !isFiniteNonNegative(state.singGateAvailableAtMs)
    ) {
      throw new Error("Singing state requires an unfinished valid dwell deadline.");
    }
    return;
  }
  if (state.singGateAvailableAtMs !== undefined) {
    throw new Error("Only an active singing stage may retain a dwell deadline.");
  }
  const afterSinging = state.status === "thinking"
    || state.status === "playing"
    || state.status === "review"
    || state.status === "transfer-offer"
    || state.status === "transfer"
    || state.status === "completed"
    || (state.status === "listening" && state.playbackReturnStatus === "thinking");
  if (afterSinging && state.singSkipped === state.singGateCompleted) {
    throw new Error("Post-singing state requires exactly one completed or skipped fact.");
  }
  const beforeSinging = state.status === "setup"
    || state.status === "ready"
    || state.status === "recall"
    || (state.status === "listening" && state.playbackReturnStatus === "recall");
  if (beforeSinging && (state.singSkipped || state.singGateCompleted)) {
    throw new Error("Pre-singing state cannot contain singing outcome facts.");
  }
}

function validateReviewAndTransferFacts(state: DegreePracticeState): void {
  const ratings: readonly PracticeRating[] = ["again", "hard", "good", "easy"];
  const issues: readonly PracticeIssue[] = [
    "pitch", "rhythm", "duration", "recall", "fretboard",
  ];
  if (state.rating !== undefined && !ratings.includes(state.rating)) {
    throw new Error("Practice rating is invalid.");
  }
  if (state.mainIssue !== undefined && !issues.includes(state.mainIssue)) {
    throw new Error("Practice issue is invalid.");
  }
  if (state.mainIssue !== undefined && state.rating === undefined) {
    throw new Error("A self-reported issue requires a rating.");
  }
  if (state.status === "transfer-offer") {
    if (
      state.transferAttempted
      || (state.rating !== "good" && state.rating !== "easy")
    ) {
      throw new Error("Transfer offer requires an unattempted Good or Easy rating.");
    }
    return;
  }
  if (state.status === "transfer") {
    if (
      !state.transferAttempted
      || (state.rating !== "good" && state.rating !== "easy")
    ) {
      throw new Error("Transfer state requires an attempted Good or Easy source rating.");
    }
    return;
  }
  if (state.status === "completed") {
    if (state.rating === undefined) {
      throw new Error("Completed practice requires a self rating.");
    }
    return;
  }
  if (state.status === "abandoned") {
    if (state.rating !== undefined && state.rating !== "good" && state.rating !== "easy") {
      throw new Error("Abandoned rated state must originate from a transfer offer.");
    }
    return;
  }
  if (state.rating !== undefined || state.mainIssue !== undefined) {
    throw new Error("Only reviewed states may contain rating facts.");
  }
  if (
    state.transferAttempted
    && state.status !== "review"
  ) {
    throw new Error("Transfer attempt is unreachable in the current state.");
  }
}

function canUseHintIn(status: PracticeStatus): boolean {
  return status === "recall"
    || status === "singing"
    || status === "thinking"
    || status === "playing";
}

function isFiniteNonNegative(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function success(state: DegreePracticeState): PracticeTransitionResult {
  return Object.freeze({ ok: true, state: freezeState(state) });
}

function failure(
  code: PracticeTransitionErrorCode,
  message: string,
): PracticeTransitionResult {
  return Object.freeze({ ok: false, error: Object.freeze({ code, message }) });
}

function invalidTransition(
  state: DegreePracticeState,
  action: PracticeAction["type"],
): PracticeTransitionResult {
  return failure(
    "invalid-transition",
    `Action ${action} is invalid while practice is ${state.status}.`,
  );
}

function freezeState(state: DegreePracticeState): DegreePracticeState {
  return Object.freeze(state);
}
