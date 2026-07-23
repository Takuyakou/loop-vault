import type { SavedProgressionBlock } from "../types";
import { progressionFingerprint } from "./progressionFingerprint";
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
): PracticeProgressState {
  const progress = block.practice;
  if (!progress) return "unstarted";
  if (progress.progressionFingerprint !== progressionFingerprint(block)) return "stale";
  if (progress.confirmedLevel) return "confirmed";
  if (!progress.provisional) return "unstarted";
  return progress.provisional.clearedOnLocalDate === localDate
    ? "provisional"
    : "confirmation-due";
}

export function resetPracticeProgress(
  block: SavedProgressionBlock,
): ProgressionPracticeProgress {
  return {
    schemaVersion: 1,
    progressionFingerprint: progressionFingerprint(block),
  };
}

export function recordPracticeRound(
  block: SavedProgressionBlock,
  input: RecordPracticeRoundInput,
): ProgressionPracticeProgress {
  const fingerprint = progressionFingerprint(block);
  const current = block.practice?.progressionFingerprint === fingerprint
    ? block.practice
    : resetPracticeProgress(block);
  const reachedTarget = input.bpm >= input.targetTempo;
  const provisional = current.provisional;
  const canConfirm = reachedTarget
    && input.consecutiveCleanFlowRounds >= 1
    && provisional?.level === input.level
    && provisional.clearedOnLocalDate !== input.localDate;

  if (canConfirm) {
    return {
      schemaVersion: 1,
      progressionFingerprint: fingerprint,
      confirmedLevel: maxLevel(current.confirmedLevel, input.level),
      lastPracticedAt: input.nowIso,
    };
  }

  const canProvisional = reachedTarget && input.consecutiveCleanFlowRounds >= 2;
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

function maxLevel(
  current: ProgressionPracticeProgress["confirmedLevel"],
  next: DojoPracticeLevel,
): ProgressionPracticeProgress["confirmedLevel"] {
  return current === undefined || next > current ? next : current;
}

