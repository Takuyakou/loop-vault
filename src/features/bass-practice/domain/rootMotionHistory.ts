import { stableHash } from "./determinism";
import type { RootMotionExercise } from "./rootMotion";
import type { RootMotionFirstAnswerEvidence } from "../application/rootMotionSession";

export const ROOT_MOTION_HISTORY_VERSION = 1 as const;

type RootMotionHistorySource =
  | { readonly kind: "generated" }
  | { readonly kind: "vault-root-path"; readonly referenceId: string; readonly snapshotSignature: string; readonly rootPathPolicyVersion: "v1" };

/**
 * An additive, Vault-independent factual record. It deliberately stores no live
 * title, raw audio, MIDI source, device identifier, or composite skill score.
 */
export interface RootMotionHistoryEntry {
  readonly id: string;
  readonly version: typeof ROOT_MOTION_HISTORY_VERSION;
  readonly completedAt: string;
  readonly exerciseSignature: string;
  readonly generatorVersion: string;
  readonly configuration: {
    readonly tempo: number;
    readonly stringCount: 4 | 5;
    readonly fretRange: { readonly min: number; readonly max: number };
    readonly handedness: "left" | "right";
  };
  readonly source: RootMotionHistorySource;
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly motions: readonly {
    readonly signedSemitones: number;
    readonly direction: "same" | "up" | "down";
    readonly category: "same" | "second" | "third" | "fourth" | "tritone" | "fifth";
  }[];
  readonly firstAnswer: RootMotionFirstAnswerEvidence;
  readonly selfRating: "again" | "hard" | "good" | "easy";
  readonly transferOfExerciseId?: string;
  readonly retainedTakeReference?: string;
}

export function createRootMotionHistoryEntry(input: {
  readonly completedAt: string;
  readonly exercise: RootMotionExercise;
  readonly firstAnswer: RootMotionFirstAnswerEvidence;
  readonly selfRating: "again" | "hard" | "good" | "easy";
  readonly transferOfExerciseId?: string;
  readonly retainedTakeReference?: string;
}): RootMotionHistoryEntry {
  const source: RootMotionHistorySource = input.exercise.source.kind === "vault-root-path"
    ? { kind: "vault-root-path", referenceId: input.exercise.source.referenceId, snapshotSignature: input.exercise.source.snapshotSignature, rootPathPolicyVersion: "v1" }
    : { kind: "generated" };
  return Object.freeze({
    id: `root-motion-history-${stableHash({ completedAt: input.completedAt, exerciseId: input.exercise.id, selfRating: input.selfRating, first: input.firstAnswer })}`,
    version: ROOT_MOTION_HISTORY_VERSION,
    completedAt: input.completedAt,
    exerciseSignature: input.exercise.id,
    generatorVersion: input.exercise.generatorVersion,
    configuration: Object.freeze({
      tempo: input.exercise.tempo,
      stringCount: input.exercise.generatorSnapshot.stringCount,
      fretRange: Object.freeze({ ...input.exercise.generatorSnapshot.fretRange }),
      handedness: input.exercise.generatorSnapshot.handedness,
    }),
    source: Object.freeze(source),
    level: input.exercise.level,
    motions: Object.freeze(input.exercise.motions.map((motion) => Object.freeze({ signedSemitones: motion.signedSemitones, direction: motion.direction, category: motion.category }))),
    firstAnswer: Object.freeze({ submitted: Object.freeze({ ...input.firstAnswer.submitted }), expected: Object.freeze({ ...input.firstAnswer.expected }), directionCorrect: input.firstAnswer.directionCorrect, categoryCorrect: input.firstAnswer.categoryCorrect, exactIntervalCorrect: input.firstAnswer.exactIntervalCorrect, replayCountBeforeFirstAnswer: input.firstAnswer.replayCountBeforeFirstAnswer, answerAttempts: input.firstAnswer.answerAttempts, assistance: input.firstAnswer.assistance }),
    selfRating: input.selfRating,
    ...(input.transferOfExerciseId ? { transferOfExerciseId: input.transferOfExerciseId } : {}),
    ...(input.retainedTakeReference ? { retainedTakeReference: input.retainedTakeReference } : {}),
  });
}