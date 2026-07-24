import type {
  MixOrderItem,
  MixProgressionReference,
  ProgressionBagDraw,
  ProgressionBagState,
} from "./types";

export function progressionReferenceKey(
  reference: MixProgressionReference,
): string {
  return `${encodeURIComponent(reference.ideaId)}:${encodeURIComponent(reference.blockId)}`;
}

export function sameProgressionReference(
  left: MixProgressionReference | undefined,
  right: MixProgressionReference | undefined,
): boolean {
  return Boolean(
    left
    && right
    && left.ideaId === right.ideaId
    && left.blockId === right.blockId,
  );
}

export function createProgressionBag(
  references: readonly MixProgressionReference[],
  seed: number,
  lastDrawnReference?: MixProgressionReference,
): ProgressionBagState {
  const unique = uniqueReferences(references);
  const shuffled = deterministicShuffle(unique, seed);
  if (
    shuffled.length > 1
    && sameProgressionReference(shuffled[0], lastDrawnReference)
  ) {
    const replacementIndex = shuffled.findIndex(
      (reference) => !sameProgressionReference(reference, lastDrawnReference),
    );
    [shuffled[0], shuffled[replacementIndex]] = [
      shuffled[replacementIndex],
      shuffled[0],
    ];
  }
  return freezeBag({
    remainingReferences: shuffled,
    completedReferences: [],
    ...(lastDrawnReference
      ? { lastDrawnReference: cloneReference(lastDrawnReference) }
      : {}),
    seed: normalizeSeed(seed),
  });
}

export function drawProgression(
  state: ProgressionBagState,
): ProgressionBagDraw {
  const reference = state.remainingReferences[0];
  if (!reference) return { nextState: state };
  const drawn = cloneReference(reference);
  return {
    reference: drawn,
    nextState: freezeBag({
      remainingReferences: state.remainingReferences.slice(1),
      completedReferences: [...state.completedReferences, drawn],
      lastDrawnReference: drawn,
      seed: state.seed,
    }),
  };
}

export function buildProgressionOrder(
  references: readonly MixProgressionReference[],
  cycles: 1 | 2 | 3,
  seed: number,
): readonly MixOrderItem[] {
  const unique = uniqueReferences(references);
  const order: MixOrderItem[] = [];
  let last: MixProgressionReference | undefined;
  let cycleSeed = normalizeSeed(seed);
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    let bag = createProgressionBag(unique, cycleSeed, last);
    for (let progressionIndex = 1; progressionIndex <= unique.length; progressionIndex += 1) {
      const draw = drawProgression(bag);
      if (!draw.reference) break;
      last = draw.reference;
      bag = draw.nextState;
      order.push(Object.freeze({
        reference: cloneReference(draw.reference),
        cycle,
        progressionIndex,
      }));
    }
    cycleSeed = nextSeed(cycleSeed);
  }
  return Object.freeze(order);
}

function uniqueReferences(
  references: readonly MixProgressionReference[],
): MixProgressionReference[] {
  const byKey = new Map<string, MixProgressionReference>();
  for (const reference of references) {
    const key = progressionReferenceKey(reference);
    if (!byKey.has(key)) byKey.set(key, cloneReference(reference));
  }
  return [...byKey.values()].sort((left, right) => (
    progressionReferenceKey(left).localeCompare(progressionReferenceKey(right))
  ));
}

function deterministicShuffle(
  values: readonly MixProgressionReference[],
  seed: number,
): MixProgressionReference[] {
  const result = values.map(cloneReference);
  let state = normalizeSeed(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = nextSeed(state);
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function nextSeed(seed: number): number {
  let value = normalizeSeed(seed);
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return normalizeSeed(value);
}

function normalizeSeed(seed: number): number {
  return (Number.isFinite(seed) ? Math.trunc(seed) : 0) >>> 0;
}

function cloneReference(
  reference: MixProgressionReference,
): MixProgressionReference {
  return Object.freeze({
    ideaId: reference.ideaId,
    blockId: reference.blockId,
  });
}

function freezeBag(state: ProgressionBagState): ProgressionBagState {
  return Object.freeze({
    ...state,
    remainingReferences: Object.freeze(
      state.remainingReferences.map(cloneReference),
    ),
    completedReferences: Object.freeze(
      state.completedReferences.map(cloneReference),
    ),
    ...(state.lastDrawnReference
      ? { lastDrawnReference: cloneReference(state.lastDrawnReference) }
      : {}),
  });
}
