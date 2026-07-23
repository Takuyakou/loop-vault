import { normalizePracticePitchClass } from "./keyCatalog";
import type { KeyBagSelection, KeyBagState } from "./types";

export function createKeyBag(
  pool: readonly number[],
  seed: number,
): KeyBagState {
  const normalizedSeed = seed >>> 0;
  const remaining = [...new Set(pool.map(normalizePracticePitchClass))];
  shuffleInPlace(remaining, normalizedSeed);
  return {
    remaining,
    completed: [],
    seed: normalizedSeed,
  };
}

export function drawNextKey(state: KeyBagState): KeyBagSelection {
  const [keyPitchClass, ...remaining] = state.remaining;
  if (keyPitchClass === undefined) {
    return {
      keyPitchClass: undefined,
      nextState: cloneState(state),
    };
  }
  return {
    keyPitchClass,
    nextState: {
      remaining,
      completed: [...state.completed, keyPitchClass],
      seed: state.seed,
    },
  };
}

export function selectManualKey(
  state: KeyBagState,
  requestedPitchClass: number,
): KeyBagSelection {
  const keyPitchClass = normalizePracticePitchClass(requestedPitchClass);
  const remainingIndex = state.remaining.indexOf(keyPitchClass);
  if (remainingIndex < 0) {
    return {
      keyPitchClass: state.completed.includes(keyPitchClass)
        ? keyPitchClass
        : undefined,
      nextState: cloneState(state),
    };
  }
  return {
    keyPitchClass,
    nextState: {
      remaining: state.remaining.filter((_, index) => index !== remainingIndex),
      completed: [...state.completed, keyPitchClass],
      seed: state.seed,
    },
  };
}

function shuffleInPlace(values: number[], seed: number): void {
  let state = seed || 0x6d2b79f5;
  for (let index = values.length - 1; index > 0; index -= 1) {
    state = nextState(state);
    const target = state % (index + 1);
    [values[index], values[target]] = [values[target], values[index]];
  }
}

function nextState(value: number): number {
  let state = value >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

function cloneState(state: KeyBagState): KeyBagState {
  return {
    remaining: [...state.remaining],
    completed: [...state.completed],
    seed: state.seed,
  };
}
