import { isCleanRound, nextCleanFlowCount } from "./cleanRound";
import { matchPerformance } from "./matchPerformance";
import type {
  PracticeAction,
  PracticeInputSnapshot,
  PracticeSessionContext,
  PracticeSessionState,
} from "./types";

export const PRACTICE_MATCH_STABLE_MS = 100;

export function createPracticeSessionState(
  input: Omit<PracticeSessionState,
    | "status"
    | "currentEventIndex"
    | "roundNumber"
    | "roundDirty"
    | "consecutiveCleanFlowRounds"
    | "requiredAttackRevision"
    | "eventResults"
  > & { eventCount: number },
): PracticeSessionState {
  return {
    blockId: input.blockId,
    progressionFingerprint: input.progressionFingerprint,
    level: input.level,
    mode: input.mode,
    leniency: input.leniency,
    status: "ready",
    currentEventIndex: 0,
    roundNumber: 1,
    roundDirty: false,
    consecutiveCleanFlowRounds: 0,
    bpm: input.bpm,
    targetTempo: input.targetTempo,
    requiredAttackRevision: 0,
    eventResults: Array.from({ length: input.eventCount }, () => "pending"),
  };
}

export function reducePracticeSession(
  state: PracticeSessionState,
  action: PracticeAction,
  context: PracticeSessionContext,
): PracticeSessionState {
  switch (action.type) {
    case "START_SESSION":
      return state.status === "ready" || state.status === "paused"
        ? { ...state, status: "running" }
        : state;
    case "PAUSE":
    case "DEVICE_DISCONNECTED":
      return state.status === "running"
        ? { ...state, status: "paused", provisionalCandidate: undefined, lastInput: undefined }
        : state;
    case "RESUME":
      return state.status === "paused" ? { ...state, status: "running" } : state;
    case "END_SESSION":
      return { ...state, status: "completed", provisionalCandidate: undefined };
    case "FLOW_TARGET_OPEN":
      if (state.mode !== "flow" || state.status !== "running") return state;
      return {
        ...state,
        currentEventIndex: boundedEventIndex(action.eventIndex, context.events.length),
        provisionalCandidate: undefined,
        lastMatch: undefined,
      };
    case "FLOW_TARGET_CLOSE": {
      if (state.mode !== "flow" || state.status !== "running") return state;
      const index = boundedEventIndex(action.eventIndex, state.eventResults.length);
      if (state.eventResults[index] === "match") return state;
      return {
        ...state,
        eventResults: replaceAt(state.eventResults, index, "miss"),
        roundDirty: true,
        provisionalCandidate: undefined,
      };
    }
    case "ROUND_COMPLETED": {
      const clean = isCleanRound(state.eventResults, state.roundDirty);
      return {
        ...state,
        currentEventIndex: 0,
        roundNumber: state.roundNumber + 1,
        roundDirty: false,
        consecutiveCleanFlowRounds: state.mode === "flow"
          ? nextCleanFlowCount(state.consecutiveCleanFlowRounds, clean)
          : state.consecutiveCleanFlowRounds,
        eventResults: state.eventResults.map(() => "pending"),
        provisionalCandidate: undefined,
        lastRoundWasClean: clean,
      };
    }
    case "MIDI_STATE_CHANGED":
      return withMidiInput(state, action.input, context);
    case "STABLE_DEADLINE":
      return settleCandidate(state, action.nowMs, context);
  }
}

function withMidiInput(
  state: PracticeSessionState,
  input: PracticeInputSnapshot,
  context: PracticeSessionContext,
): PracticeSessionState {
  if (state.status !== "running") return state;
  const requirements = context.requirements[state.currentEventIndex];
  if (!requirements) return state;
  const result = context.matchInput
    ? context.matchInput(
        requirements,
        input,
        state.requiredAttackRevision,
        state.currentEventIndex,
      )
    : matchPerformance(requirements, input, state.requiredAttackRevision);
  if (result.state === "empty" || result.state === "partial") {
    return {
      ...state,
      lastInput: input,
      lastMatch: result,
      provisionalCandidate: undefined,
    };
  }

  const pitchSignature = result.heldPitchClasses.join(",");
  const previous = state.provisionalCandidate;
  const unchanged = previous?.state === result.state
    && previous.pitchSignature === pitchSignature
    && previous.attackRevision === input.attackRevision;
  return {
    ...state,
    lastInput: input,
    lastMatch: result,
    provisionalCandidate: unchanged
      ? previous
      : {
          state: result.state,
          sinceMs: input.timestampMs,
          pitchSignature,
          attackRevision: input.attackRevision,
        },
  };
}

function settleCandidate(
  state: PracticeSessionState,
  nowMs: number,
  context: PracticeSessionContext,
): PracticeSessionState {
  const candidate = state.provisionalCandidate;
  if (
    state.status !== "running"
    || !candidate
    || nowMs - candidate.sinceMs < PRACTICE_MATCH_STABLE_MS
  ) {
    return state;
  }
  if (candidate.state === "wrong") {
    return { ...state, roundDirty: true, provisionalCandidate: undefined };
  }

  const eventResults = replaceAt(state.eventResults, state.currentEventIndex, "match");
  if (state.mode === "flow") {
    return {
      ...state,
      eventResults,
      requiredAttackRevision: candidate.attackRevision + 1,
      provisionalCandidate: undefined,
    };
  }

  const lastEvent = state.currentEventIndex >= context.events.length - 1;
  if (!lastEvent) {
    return {
      ...state,
      eventResults,
      currentEventIndex: state.currentEventIndex + 1,
      requiredAttackRevision: candidate.attackRevision + 1,
      provisionalCandidate: undefined,
      lastMatch: undefined,
    };
  }

  const clean = isCleanRound(eventResults, state.roundDirty);
  return {
    ...state,
    currentEventIndex: 0,
    roundNumber: state.roundNumber + 1,
    roundDirty: false,
    eventResults: eventResults.map(() => "pending"),
    requiredAttackRevision: candidate.attackRevision + 1,
    provisionalCandidate: undefined,
    lastMatch: undefined,
    lastRoundWasClean: clean,
  };
}

function boundedEventIndex(index: number, length: number): number {
  return Math.max(0, Math.min(Math.max(0, length - 1), index));
}

function replaceAt<T>(values: readonly T[], index: number, value: T): T[] {
  return values.map((entry, entryIndex) => entryIndex === index ? value : entry);
}

