import {
  createPracticeSessionState,
  reducePracticeSession,
  type PracticeSessionContext,
} from "../practice";
import {
  buildProgressionOrder,
  progressionReferenceKey,
  sameProgressionReference,
} from "./progressionBag";
import type {
  MixOrderItem,
  MixProgressionReference,
  MixProgressionResultValue,
  MixSessionAction,
  MixSessionConfig,
  MixSessionState,
  MixSessionSummary,
  MixProgressionSnapshot,
} from "./types";

export function createMixSessionState(
  config: MixSessionConfig,
  snapshots: readonly MixProgressionSnapshot[],
  sessionSeed: number,
  options: { readonly allowSingle?: boolean } = {},
): MixSessionState {
  const ownedSnapshots = deepFreeze(
    structuredClone(snapshots),
  ) as readonly MixProgressionSnapshot[];
  const minimum = options.allowSingle ? 1 : 2;
  if (ownedSnapshots.length < minimum || ownedSnapshots.length > 5) {
    throw new RangeError(`Mix session requires ${minimum} to 5 progressions.`);
  }
  const snapshotKeys = new Set(
    ownedSnapshots.map((snapshot) => progressionReferenceKey(snapshot.reference)),
  );
  if (snapshotKeys.size !== ownedSnapshots.length) {
    throw new Error("Mix session snapshots contain duplicate references.");
  }
  const order = buildProgressionOrder(
    ownedSnapshots.map((snapshot) => snapshot.reference),
    config.cycles,
    sessionSeed,
  );
  return Object.freeze({
    status: "ready",
    config: cloneConfig(config, ownedSnapshots),
    snapshots: ownedSnapshots,
    order,
    currentOrderIndex: 0,
    results: Object.freeze([]),
    currentPracticeSession: createPracticeForOrderItem(
      order[0],
      ownedSnapshots,
      config,
    ),
    sessionSeed: sessionSeed >>> 0,
  });
}

export function currentMixOrderItem(
  state: MixSessionState,
): MixOrderItem | undefined {
  return state.order[state.currentOrderIndex];
}

export function currentMixSnapshot(
  state: MixSessionState,
): MixProgressionSnapshot | undefined {
  const item = currentMixOrderItem(state);
  return item
    ? findSnapshot(state.snapshots, item.reference)
    : undefined;
}

export function reduceMixSession(
  state: MixSessionState,
  action: MixSessionAction,
  context?: PracticeSessionContext,
): MixSessionState {
  if (action.type === "END") {
    return Object.freeze({
      ...state,
      status: "completed",
      currentPracticeSession: state.currentPracticeSession && context
        ? reducePracticeSession(
            state.currentPracticeSession,
            { type: "END_SESSION" },
            context,
          )
        : state.currentPracticeSession,
    });
  }
  if (!state.currentPracticeSession) return state;
  if (action.type === "START_CURRENT") {
    if (state.status !== "ready" && state.status !== "between-progressions") {
      return state;
    }
    if (!context) return state;
    const guardedPractice = action.requiredAttackRevision === undefined
      ? state.currentPracticeSession
      : {
          ...state.currentPracticeSession,
          requiredAttackRevision: Math.max(
            state.currentPracticeSession.requiredAttackRevision,
            action.requiredAttackRevision,
          ),
        };
    return Object.freeze({
      ...state,
      status: "running",
      currentPracticeSession: reducePracticeSession(
        guardedPractice,
        { type: "START_SESSION" },
        context,
      ),
    });
  }
  if (action.type === "PAUSE") {
    if (state.status !== "running" || !context) return state;
    return Object.freeze({
      ...state,
      status: "paused",
      currentPracticeSession: reducePracticeSession(
        state.currentPracticeSession,
        { type: "PAUSE" },
        context,
      ),
    });
  }
  if (action.type === "RESUME") {
    if (state.status !== "paused" || !context) return state;
    const guardedPractice = action.requiredAttackRevision === undefined
      ? state.currentPracticeSession
      : {
          ...state.currentPracticeSession,
          requiredAttackRevision: Math.max(
            state.currentPracticeSession.requiredAttackRevision,
            action.requiredAttackRevision,
          ),
        };
    return Object.freeze({
      ...state,
      status: "running",
      currentPracticeSession: reducePracticeSession(
        guardedPractice,
        { type: "RESUME" },
        context,
      ),
    });
  }
  if (action.type === "RESTART_CURRENT") {
    if (state.status !== "paused" || !context) return state;
    const practice = createPracticeForOrderItem(
      currentMixOrderItem(state),
      state.snapshots,
      state.config,
    );
    if (!practice) return state;
    const guardedPractice = action.requiredAttackRevision === undefined
      ? practice
      : {
          ...practice,
          requiredAttackRevision: Math.max(
            practice.requiredAttackRevision,
            action.requiredAttackRevision,
          ),
        };
    return Object.freeze({
      ...state,
      status: "running",
      currentPracticeSession: reducePracticeSession(
        guardedPractice,
        { type: "START_SESSION" },
        context,
      ),
    });
  }
  if (
    action.type !== "PRACTICE_ACTION"
    || state.status !== "running"
    || !context
  ) {
    return state;
  }

  const nextPractice = reducePracticeSession(
    state.currentPracticeSession,
    action.action,
    context,
  );
  const progressionCompleted = state.config.mode === "step"
    ? (
        action.action.type === "STABLE_DEADLINE"
        && nextPractice.lastRoundWasClean !== undefined
        && nextPractice.roundNumber > state.currentPracticeSession.roundNumber
      )
    : action.action.type === "ROUND_COMPLETED";
  if (!progressionCompleted) {
    return Object.freeze({
      ...state,
      currentPracticeSession: nextPractice,
    });
  }
  return finishCurrentProgression(
    state,
    nextPractice.lastRoundWasClean ? "clean" : "dirty",
  );
}

export function mixSessionSummary(
  state: MixSessionState,
): MixSessionSummary {
  const dirtyKeys = new Set(
    state.results
      .filter((result) => result.result === "dirty")
      .map((result) => progressionReferenceKey(result.reference)),
  );
  const cleanKeys = new Set(
    state.results
      .filter((result) => result.result === "clean")
      .map((result) => progressionReferenceKey(result.reference)),
  );
  const dirty = state.snapshots.filter(
    (snapshot) => dirtyKeys.has(progressionReferenceKey(snapshot.reference)),
  );
  const clean = state.snapshots.filter((snapshot) => {
    const key = progressionReferenceKey(snapshot.reference);
    return cleanKeys.has(key) && !dirtyKeys.has(key);
  });
  return Object.freeze({
    clean: Object.freeze(clean),
    dirty: Object.freeze(dirty),
    cycles: state.config.cycles,
  });
}

export function retryDirtyMixSession(
  state: MixSessionState,
  sessionSeed: number,
): MixSessionState | undefined {
  const dirty = mixSessionSummary(state).dirty;
  if (dirty.length === 0) return undefined;
  return createMixSessionState(
    {
      ...state.config,
      references: dirty.map((snapshot) => snapshot.reference),
      cycles: 1,
    },
    dirty,
    sessionSeed,
    { allowSingle: true },
  );
}

export function retrySameMixSession(
  state: MixSessionState,
  sessionSeed: number,
): MixSessionState {
  return createMixSessionState(
    state.config,
    state.snapshots,
    sessionSeed,
  );
}

function finishCurrentProgression(
  state: MixSessionState,
  result: MixProgressionResultValue,
): MixSessionState {
  const item = currentMixOrderItem(state);
  const snapshot = currentMixSnapshot(state);
  if (!item || !snapshot) return state;
  const results = Object.freeze([
    ...state.results,
    Object.freeze({
      reference: Object.freeze({ ...item.reference }),
      title: snapshot.title,
      cycle: item.cycle,
      result,
    }),
  ]);
  const nextIndex = state.currentOrderIndex + 1;
  const nextItem = state.order[nextIndex];
  if (!nextItem) {
    return Object.freeze({
      ...state,
      status: "summary",
      results,
      currentPracticeSession: undefined,
    });
  }
  return Object.freeze({
    ...state,
    status: "between-progressions",
    currentOrderIndex: nextIndex,
    results,
    currentPracticeSession: createPracticeForOrderItem(
      nextItem,
      state.snapshots,
      state.config,
    ),
  });
}

function createPracticeForOrderItem(
  item: MixOrderItem | undefined,
  snapshots: readonly MixProgressionSnapshot[],
  config: MixSessionConfig,
) {
  if (!item) return undefined;
  const snapshot = findSnapshot(snapshots, item.reference);
  if (!snapshot) throw new Error("Mix order references a missing snapshot.");
  return createPracticeSessionState({
    blockId: snapshot.reference.blockId,
    progressionFingerprint: snapshot.progressionFingerprint,
    level: config.level,
    mode: config.mode,
    leniency: config.leniency,
    bpm: config.bpm,
    targetTempo: config.bpm,
    eventCount: snapshot.events.length,
  });
}

function findSnapshot(
  snapshots: readonly MixProgressionSnapshot[],
  reference: MixProgressionReference,
): MixProgressionSnapshot | undefined {
  return snapshots.find((snapshot) => (
    sameProgressionReference(snapshot.reference, reference)
  ));
}

function cloneConfig(
  config: MixSessionConfig,
  snapshots: readonly MixProgressionSnapshot[],
): MixSessionConfig {
  return Object.freeze({
    ...config,
    references: Object.freeze(
      snapshots.map((snapshot) => Object.freeze({ ...snapshot.reference })),
    ),
    targetSource: Object.freeze({ ...config.targetSource }),
  });
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
