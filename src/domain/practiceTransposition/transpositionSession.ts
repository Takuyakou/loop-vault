import {
  createL4KeyPool,
  createL5KeyPool,
} from "./circleOfFifths";
import {
  createKeyBag,
  drawNextKey,
} from "./keyBag";
import { normalizePracticePitchClass } from "./keyCatalog";
import type {
  KeyBagState,
  SupportedPracticeMode,
} from "./types";
import type { PracticeTargetSource } from "../voicingPractice";

export type TranspositionPracticeLevel = 4 | 5;
export type TranspositionEligibilityReason =
  | "flow-required"
  | "target-tempo-required"
  | "resolved-voicing-required"
  | "prerequisite-required"
  | "progression-stale";

export interface TranspositionEligibility {
  eligible: boolean;
  reasons: TranspositionEligibilityReason[];
}

export interface EvaluateTranspositionEligibilityInput {
  level: TranspositionPracticeLevel;
  mode: "step" | "flow";
  bpm: number;
  targetTempo: number;
  targetSource: PracticeTargetSource;
  confirmedLevel?: number;
  stale: boolean;
}

export interface TranspositionSessionState {
  level: TranspositionPracticeLevel;
  sourceKeyPitchClass: number;
  sourceMode: SupportedPracticeMode;
  currentTargetKeyPitchClass: number;
  keyPool: number[];
  keyBag: KeyBagState;
  sessionClearedPitchClasses: number[];
  officialProgressEligible: boolean;
  eligibilityReasons: TranspositionEligibilityReason[];
  inConfirmationChallenge: boolean;
  confirmationPitchClasses?: number[];
  confirmationIndex?: number;
  sessionSeed: number;
}

export interface CreateTranspositionSessionInput {
  level: TranspositionPracticeLevel;
  sourceKeyPitchClass: number;
  sourceMode: SupportedPracticeMode;
  seed: number;
  eligibility: TranspositionEligibility;
}

export function evaluateTranspositionEligibility(
  input: EvaluateTranspositionEligibilityInput,
): TranspositionEligibility {
  const reasons: TranspositionEligibilityReason[] = [];
  if (input.mode !== "flow") reasons.push("flow-required");
  if (input.bpm < input.targetTempo) reasons.push("target-tempo-required");
  if (input.targetSource.type !== "resolved-voicing") {
    reasons.push("resolved-voicing-required");
  }
  if ((input.confirmedLevel ?? 0) < input.level - 1) {
    reasons.push("prerequisite-required");
  }
  if (input.stale) reasons.push("progression-stale");
  return {
    eligible: reasons.length === 0,
    reasons,
  };
}

export function createTranspositionSession(
  input: CreateTranspositionSessionInput,
): TranspositionSessionState {
  const sourceKeyPitchClass = normalizePracticePitchClass(input.sourceKeyPitchClass);
  const keyPool = input.level === 4
    ? createL4KeyPool(sourceKeyPitchClass)
    : createL5KeyPool(sourceKeyPitchClass);
  const keyBag = createKeyBag(keyPool, input.seed);
  const first = drawNextKey(keyBag);
  if (first.keyPitchClass === undefined) {
    throw new Error("Transposition practice requires at least one target key.");
  }
  return {
    level: input.level,
    sourceKeyPitchClass,
    sourceMode: input.sourceMode,
    currentTargetKeyPitchClass: first.keyPitchClass,
    keyPool,
    keyBag: first.nextState,
    sessionClearedPitchClasses: [],
    officialProgressEligible: input.eligibility.eligible,
    eligibilityReasons: [...input.eligibility.reasons],
    inConfirmationChallenge: false,
    sessionSeed: input.seed >>> 0,
  };
}

export function setTranspositionEligibility(
  state: TranspositionSessionState,
  eligibility: TranspositionEligibility,
): TranspositionSessionState {
  return {
    ...cloneState(state),
    officialProgressEligible: eligibility.eligible,
    eligibilityReasons: [...eligibility.reasons],
  };
}

export function completeTranspositionRound(
  state: TranspositionSessionState,
  input: {
    mode: "step" | "flow";
    clean: boolean;
    meetsTargetTempo: boolean;
  },
): TranspositionSessionState {
  if (
    input.mode !== "flow"
    || !input.clean
    || !input.meetsTargetTempo
  ) return cloneState(state);

  return advanceTargetKey(state, true);
}

export function skipTranspositionKey(
  state: TranspositionSessionState,
): TranspositionSessionState {
  return advanceTargetKey(state, false);
}

function advanceTargetKey(
  state: TranspositionSessionState,
  markCurrentCleared: boolean,
): TranspositionSessionState {
  const sessionClearedPitchClasses = markCurrentCleared
    ? appendUnique(
        state.sessionClearedPitchClasses,
        state.currentTargetKeyPitchClass,
      )
    : [...state.sessionClearedPitchClasses];
  const bagWithoutCurrent = removePitchClass(
    state.keyBag,
    state.currentTargetKeyPitchClass,
  );
  let selection = drawNextKey(bagWithoutCurrent);
  let sessionSeed = state.sessionSeed;
  if (selection.keyPitchClass === undefined) {
    sessionSeed = nextCycleSeed(state.sessionSeed);
    selection = drawNextKey(createKeyBag(state.keyPool, sessionSeed));
  }
  if (selection.keyPitchClass === undefined) {
    throw new Error("Transposition practice could not draw the next key.");
  }

  return {
    ...cloneState(state),
    currentTargetKeyPitchClass: selection.keyPitchClass,
    keyBag: selection.nextState,
    sessionClearedPitchClasses,
    sessionSeed,
  };
}

export function selectTranspositionKey(
  state: TranspositionSessionState,
  requestedPitchClass: number,
): TranspositionSessionState {
  const target = normalizePracticePitchClass(requestedPitchClass);
  if (!state.keyPool.includes(target)) return cloneState(state);
  return {
    ...cloneState(state),
    currentTargetKeyPitchClass: target,
  };
}

function removePitchClass(
  state: KeyBagState,
  pitchClass: number,
): KeyBagState {
  const normalized = normalizePracticePitchClass(pitchClass);
  return {
    remaining: state.remaining.filter((value) => value !== normalized),
    completed: state.completed.includes(normalized)
      ? [...state.completed]
      : [...state.completed, normalized],
    seed: state.seed,
  };
}

function appendUnique(values: readonly number[], value: number): number[] {
  const normalized = normalizePracticePitchClass(value);
  return values.includes(normalized) ? [...values] : [...values, normalized];
}

function nextCycleSeed(seed: number): number {
  return (seed + 0x9e3779b9) >>> 0;
}

function cloneState(
  state: TranspositionSessionState,
): TranspositionSessionState {
  return {
    ...state,
    keyPool: [...state.keyPool],
    keyBag: {
      remaining: [...state.keyBag.remaining],
      completed: [...state.keyBag.completed],
      seed: state.keyBag.seed,
    },
    sessionClearedPitchClasses: [...state.sessionClearedPitchClasses],
    eligibilityReasons: [...state.eligibilityReasons],
    ...(state.confirmationPitchClasses
      ? { confirmationPitchClasses: [...state.confirmationPitchClasses] }
      : {}),
  };
}
