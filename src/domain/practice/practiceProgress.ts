import type { SavedProgressionBlock } from "../types";
import {
  isCompatibleProgressionFingerprint,
  progressionFingerprint,
} from "./progressionFingerprint";
import type { DojoPracticeLevel, ProgressionPracticeProgress } from "./types";

export type PracticeProgressState =
  | "unstarted"
  | "provisional"
  | "confirmation-due"
  | "confirmed"
  | "stale";

export interface RecordPracticeRoundInput {
  level: DojoPracticeLevel;
  bpm: number;
  targetTempo: number;
  consecutiveCleanFlowRounds: number;
  nowIso: string;
  localDate: string;
}

export function practiceProgressState(
  block: SavedProgressionBlock,
  localDate: string,
  effectiveKeySignature?: string,
): PracticeProgressState {
  if (!block.practice) return "unstarted";
  const progress = practiceProgressForCurrentFingerprint(
    block,
    effectiveKeySignature,
  );
  if (!progress) return "stale";
  if (
    progress.provisional
    && (!progress.confirmedLevel || progress.provisional.level > progress.confirmedLevel)
  ) {
    return progress.provisional.clearedOnLocalDate === localDate
      ? "provisional"
      : "confirmation-due";
  }
  return progress.confirmedLevel ? "confirmed" : "unstarted";
}

export function resetPracticeProgress(
  block: SavedProgressionBlock,
  effectiveKeySignature?: string,
): ProgressionPracticeProgress {
  return {
    schemaVersion: 1,
    progressionFingerprint: progressionFingerprint(block, effectiveKeySignature),
  };
}

export function recordPracticeRound(
  block: SavedProgressionBlock,
  input: RecordPracticeRoundInput,
  effectiveKeySignature?: string,
): ProgressionPracticeProgress {
  const fingerprint = progressionFingerprint(block, effectiveKeySignature);
  const compatible = practiceProgressForCurrentFingerprint(
    block,
    effectiveKeySignature,
  );
  const current = compatible
    ? {
        ...compatible,
        progressionFingerprint: fingerprint,
      }
    : resetPracticeProgress(block, effectiveKeySignature);
  const reachedTarget = input.bpm >= input.targetTempo;
  const provisional = current.provisional;
  const canConfirm = reachedTarget
    && input.consecutiveCleanFlowRounds >= 1
    && provisional?.level === input.level
    && provisional.clearedOnLocalDate !== input.localDate;

  if (canConfirm) {
    return {
      ...current,
      schemaVersion: 1,
      progressionFingerprint: fingerprint,
      confirmedLevel: maxLevel(current.confirmedLevel, input.level),
      provisional: undefined,
      lastPracticedAt: input.nowIso,
    };
  }

  const canProvisional = reachedTarget
    && input.consecutiveCleanFlowRounds >= 2
    && (!current.confirmedLevel || input.level > current.confirmedLevel);
  return {
    ...current,
    schemaVersion: 1,
    progressionFingerprint: fingerprint,
    ...(canProvisional
      ? {
          provisional: {
            level: input.level,
            clearedAt: input.nowIso,
            clearedOnLocalDate: input.localDate,
            targetTempo: input.targetTempo,
          },
        }
      : {}),
    lastPracticedAt: input.nowIso,
  };
}

export function practiceProgressForCurrentFingerprint(
  block: SavedProgressionBlock,
  effectiveKeySignature?: string,
  progress: ProgressionPracticeProgress | undefined = block.practice,
): ProgressionPracticeProgress | undefined {
  if (!progress) return undefined;
  if (!isCompatibleProgressionFingerprint(
    block,
    progress.progressionFingerprint,
    effectiveKeySignature,
  )) {
    return undefined;
  }
  const fingerprint = progressionFingerprint(block, effectiveKeySignature);
  return progress.progressionFingerprint === fingerprint
    ? progress
    : {
        ...progress,
        progressionFingerprint: fingerprint,
      };
}

function maxLevel(
  current: ProgressionPracticeProgress["confirmedLevel"],
  next: DojoPracticeLevel,
): ProgressionPracticeProgress["confirmedLevel"] {
  return current === undefined || next > current ? next : current;
}
