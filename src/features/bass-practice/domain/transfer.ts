import { stableHash } from "./determinism";
import {
  canonicalKeyName,
  degreeSemitoneOffset,
  degreeToPitchClass,
  fretboardPositions,
  keyPitchClass,
  playableMidiNotesForPitchClass,
} from "./mapping";
import { resolveSingingReference } from "./singingReference";
import type {
  PracticeAttempt,
  PracticeExercise,
  PracticeTargetEvent,
  TransferResult,
} from "./types";

export interface TransferOptions {
  readonly targetKey: string;
  readonly preferredStringIndex?: number;
  readonly preferredFret?: number;
}

export function deriveTransferExercise(
  sourceAttempt: PracticeAttempt,
  options: TransferOptions,
): TransferResult {
  if (
    !sourceAttempt.completedAt
    || (sourceAttempt.rating !== "good" && sourceAttempt.rating !== "easy")
  ) {
    return failure(
      "source-not-eligible",
      "Transfer requires an earlier completed Good or Easy attempt.",
    );
  }
  const source = sourceAttempt.exerciseSnapshot;
  const key = canonicalKeyName(options.targetKey, source.tonalContext.scale);
  if (!key) {
    return failure(
      "unsupported-key",
      `Unsupported ${source.tonalContext.scale} transfer key: ${options.targetKey}`,
    );
  }
  if (key === source.tonalContext.key) {
    return failure("same-key", "Transfer must use a different key.");
  }
  const tonicPitchClass = keyPitchClass(key, source.tonalContext.scale);
  if (tonicPitchClass === undefined) {
    return failure("unsupported-key", `Unsupported transfer key: ${key}`);
  }

  const snapshot = deepFreeze({
    ...source.generatorSnapshot,
    seed: `${source.seed}::transfer::${key}`,
    key,
  });
  const targetEvents: PracticeTargetEvent[] = [];
  let phraseTonicMidi: number | undefined;
  for (const event of source.targetEvents) {
    const pitchClass = degreeToPitchClass(
      tonicPitchClass,
      event.degree,
    );
    const candidates = playableMidiNotesForPitchClass(
      pitchClass,
      snapshot.tuning,
      snapshot.fretRange,
      snapshot.pitchSpan,
    );
    const absoluteTarget = phraseTonicMidi === undefined
      ? undefined
      : phraseTonicMidi + degreeSemitoneOffset(event.degree);
    const midiNote = absoluteTarget === undefined
      ? chooseTransferNote(
          candidates,
          event.midiNote,
          snapshot.tuning,
          snapshot.fretRange,
          options,
        )
      : candidates.find((candidate) => candidate === absoluteTarget);
    if (midiNote === undefined) {
      return failure(
        "unplayable-transfer",
        `Degree ${event.degree.degree} is not playable in ${key} within the configured range.`,
      );
    }
    if (phraseTonicMidi === undefined) {
      phraseTonicMidi = midiNote - degreeSemitoneOffset(event.degree);
    }
    targetEvents.push(Object.freeze({
      ...event,
      degree: Object.freeze({ ...event.degree }),
      midiNote,
    }));
  }

  const exercise = deepFreeze<PracticeExercise>({
    ...source,
    id: `degree-${stableHash({
      generatorVersion: source.generatorVersion,
      transferOfExerciseId: source.id,
      snapshot,
      targetEvents,
    })}`,
    seed: snapshot.seed,
    tonalContext: { key, scale: source.tonalContext.scale },
    targetEvents,
    singingReference: resolveSingingReference(
      targetEvents,
      snapshot.singingReferenceMode,
    ),
    generatorSnapshot: snapshot,
  });
  return Object.freeze({
    ok: true,
    sourceAttemptId: sourceAttempt.id,
    exercise,
  });
}

function chooseTransferNote(
  candidates: readonly number[],
  sourceMidiNote: number,
  tuning: readonly number[],
  fretRange: { readonly min: number; readonly max: number },
  options: TransferOptions,
): number | undefined {
  return [...candidates].sort((left, right) => (
    transferPositionCost(left, tuning, fretRange, options)
      - transferPositionCost(right, tuning, fretRange, options)
    || Math.abs(left - sourceMidiNote) - Math.abs(right - sourceMidiNote)
    || left - right
  ))[0];
}

function transferPositionCost(
  midiNote: number,
  tuning: readonly number[],
  fretRange: { readonly min: number; readonly max: number },
  options: TransferOptions,
): number {
  if (options.preferredFret === undefined && options.preferredStringIndex === undefined) {
    return 0;
  }
  const positions = fretboardPositions(midiNote, tuning, fretRange);
  return Math.min(...positions.map((position) => (
    (options.preferredFret === undefined
      ? 0
      : Math.abs(position.fret - options.preferredFret))
    + (options.preferredStringIndex === undefined
      ? 0
      : Math.abs(position.stringIndex - options.preferredStringIndex) * 4)
  )));
}

function failure(
  code: "source-not-eligible" | "same-key" | "unsupported-key" | "unplayable-transfer",
  message: string,
): TransferResult {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message }),
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
