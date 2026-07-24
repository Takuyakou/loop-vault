import type {
  PracticeProvisionalClear,
  ProgressionPracticeProgress,
} from "../practice";
import type { PracticeTargetSource } from "../voicingPractice";
import { createL4KeyPool, createL5KeyPool } from "./circleOfFifths";
import { createKeyBag, drawNextKey } from "./keyBag";
import { normalizePracticePitchClass } from "./keyCatalog";
import {
  evaluateTranspositionEligibility,
  type TranspositionPracticeLevel,
} from "./transpositionSession";

export type TranspositionProgressOutcome =
  | "none"
  | "coverage"
  | "provisional"
  | "confirmed";

export interface RecordTranspositionPracticeRoundInput {
  progressionFingerprint: string;
  level: TranspositionPracticeLevel;
  sourceKeyPitchClass: number;
  targetKeyPitchClass: number;
  mode: "step" | "flow";
  clean: boolean;
  bpm: number;
  targetTempo: number;
  targetSource: PracticeTargetSource;
  confirmedLevel?: number;
  stale: boolean;
  nowIso: string;
  localDate: string;
  seed: number;
  inConfirmationChallenge: boolean;
  confirmationCompleted: boolean;
}

export interface RecordTranspositionPracticeRoundResult {
  progress: ProgressionPracticeProgress;
  changed: boolean;
  outcome: TranspositionProgressOutcome;
}

export interface TranspositionCoverageSummary {
  level: TranspositionPracticeLevel;
  cleared: number;
  total: 6 | 12;
}

export function recordTranspositionPracticeRound(
  current: ProgressionPracticeProgress | undefined,
  input: RecordTranspositionPracticeRoundInput,
): RecordTranspositionPracticeRoundResult {
  const progress = validCurrentProgress(current, input.progressionFingerprint);
  const eligibility = evaluateTranspositionEligibility({
    level: input.level,
    mode: input.mode,
    bpm: input.bpm,
    targetTempo: input.targetTempo,
    targetSource: input.targetSource,
    confirmedLevel: input.confirmedLevel,
    stale: input.stale,
  });
  if (!input.clean || !eligibility.eligible) {
    return { progress, changed: false, outcome: "none" };
  }

  if (input.inConfirmationChallenge) {
    const provisional = progress.provisional;
    const canConfirm = input.confirmationCompleted
      && provisional?.level === input.level
      && provisional.clearedOnLocalDate !== input.localDate;
    if (!canConfirm) {
      return { progress, changed: false, outcome: "none" };
    }
    return {
      progress: {
        ...progress,
        confirmedLevel: maxPracticeLevel(progress.confirmedLevel, input.level),
        provisional: undefined,
        lastPracticedAt: input.nowIso,
      },
      changed: true,
      outcome: "confirmed",
    };
  }

  const targetKeyPitchClass = normalizePracticePitchClass(
    input.targetKeyPitchClass,
  );
  const previousCleared = progress.transposition?.clearedKeyPitchClasses ?? [];
  const clearedKeyPitchClasses = normalizeClearedKeyPitchClasses([
    ...previousCleared,
    targetKeyPitchClass,
  ]);
  const updatedProgress: ProgressionPracticeProgress = {
    ...progress,
    transposition: {
      schemaVersion: 1,
      clearedKeyPitchClasses,
      updatedAt: input.nowIso,
    },
    lastPracticedAt: input.nowIso,
  };

  const levelPool = input.level === 4
    ? createL4KeyPool(input.sourceKeyPitchClass)
    : createL5KeyPool(input.sourceKeyPitchClass);
  const coverageComplete = levelPool.every((pitchClass) => (
    clearedKeyPitchClasses.includes(pitchClass)
  ));
  const highestExistingLevel = Math.max(
    updatedProgress.confirmedLevel ?? 0,
    updatedProgress.provisional?.level ?? 0,
  );
  if (!coverageComplete || highestExistingLevel >= input.level) {
    return {
      progress: updatedProgress,
      changed: true,
      outcome: "coverage",
    };
  }

  return {
    progress: {
      ...updatedProgress,
      provisional: {
        level: input.level,
        clearedAt: input.nowIso,
        clearedOnLocalDate: input.localDate,
        targetTempo: input.targetTempo,
        confirmationPitchClasses: selectConfirmationPitchClasses(
          input.level,
          input.sourceKeyPitchClass,
          input.seed,
        ),
      },
    },
    changed: true,
    outcome: "provisional",
  };
}

export function normalizeClearedKeyPitchClasses(
  values: readonly number[],
): number[] {
  return [...new Set(values.map(normalizePracticePitchClass))]
    .sort((left, right) => left - right);
}

export function selectConfirmationPitchClasses(
  level: TranspositionPracticeLevel,
  sourceKeyPitchClass: number,
  seed: number,
): number[] {
  const source = normalizePracticePitchClass(sourceKeyPitchClass);
  if (level === 4) {
    const negative = [-1, -2, -3].map((offset) => (
      normalizePracticePitchClass(source + 7 * offset)
    ));
    const positive = [1, 2, 3].map((offset) => (
      normalizePracticePitchClass(source + 7 * offset)
    ));
    return [
      firstFromSeededBag(negative, seed),
      firstFromSeededBag(positive, seed ^ 0x9e3779b9),
    ];
  }

  const fifths = createL5KeyPool(source);
  return [0, 1, 2, 3].map((segment) => firstFromSeededBag(
    fifths.slice(segment * 3, segment * 3 + 3),
    seed ^ Math.imul(segment + 1, 0x45d9f3b),
  ));
}

export function isTranspositionCoverageComplete(
  level: TranspositionPracticeLevel,
  sourceKeyPitchClass: number,
  clearedKeyPitchClasses: readonly number[],
): boolean {
  const cleared = normalizeClearedKeyPitchClasses(clearedKeyPitchClasses);
  const pool = level === 4
    ? createL4KeyPool(sourceKeyPitchClass)
    : createL5KeyPool(sourceKeyPitchClass);
  return pool.every((pitchClass) => cleared.includes(pitchClass));
}

export function transpositionCoverageSummary(
  progress: ProgressionPracticeProgress | undefined,
): TranspositionCoverageSummary | undefined {
  const cleared = progress?.transposition?.clearedKeyPitchClasses.length;
  if (!progress || cleared === undefined) return undefined;
  const level = transpositionProgressLevel(progress);
  if (!level) return undefined;
  const total = level === 4 ? 6 : 12;
  return {
    level,
    cleared: Math.min(cleared, total),
    total,
  };
}

export function transpositionProgressLevel(
  progress: ProgressionPracticeProgress | undefined,
): TranspositionPracticeLevel | undefined {
  const cleared = progress?.transposition?.clearedKeyPitchClasses.length;
  if (!progress || cleared === undefined) return undefined;
  return (
    cleared > 6
    || (progress.confirmedLevel ?? 0) >= 4
    || progress.provisional?.level === 5
  ) ? 5 : 4;
}

function validCurrentProgress(
  current: ProgressionPracticeProgress | undefined,
  fingerprint: string,
): ProgressionPracticeProgress {
  return current?.progressionFingerprint === fingerprint
    ? cloneProgress(current)
    : {
        schemaVersion: 1,
        progressionFingerprint: fingerprint,
      };
}

function cloneProgress(
  progress: ProgressionPracticeProgress,
): ProgressionPracticeProgress {
  return {
    ...progress,
    ...(progress.provisional
      ? {
          provisional: {
            ...progress.provisional,
            ...(progress.provisional.confirmationPitchClasses
              ? {
                  confirmationPitchClasses: [
                    ...progress.provisional.confirmationPitchClasses,
                  ],
                }
              : {}),
          },
        }
      : {}),
    ...(progress.transposition
      ? {
          transposition: {
            ...progress.transposition,
            clearedKeyPitchClasses: [
              ...progress.transposition.clearedKeyPitchClasses,
            ],
          },
        }
      : {}),
  };
}

function firstFromSeededBag(values: readonly number[], seed: number): number {
  const selected = drawNextKey(createKeyBag(values, seed)).keyPitchClass;
  if (selected === undefined) {
    throw new Error("Confirmation key selection requires a non-empty pool.");
  }
  return selected;
}

function maxPracticeLevel(
  current: ProgressionPracticeProgress["confirmedLevel"],
  next: TranspositionPracticeLevel,
): ProgressionPracticeProgress["confirmedLevel"] {
  return current === undefined || next > current ? next : current;
}

export function confirmationDueForLocalDate(
  provisional: PracticeProvisionalClear | undefined,
  level: TranspositionPracticeLevel,
  localDate: string,
): boolean {
  return provisional?.level === level
    && provisional.clearedOnLocalDate !== localDate
    && provisional.confirmationPitchClasses?.length === (level === 4 ? 2 : 4);
}
