import { generateDegreeExercise } from "./generator";
import { canonicalKeyName } from "./mapping";
import type {
  PracticeAttempt,
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
  const snapshot = {
    ...source.generatorSnapshot,
    seed: `${source.seed}::transfer::${key}`,
    key,
  };
  const generated = generateDegreeExercise(snapshot);
  if (!generated.ok) return failure("unplayable-transfer", generated.error.message);
  return Object.freeze({
    ok: true,
    sourceAttemptId: sourceAttempt.id,
    exercise: generated.exercise,
  });
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
