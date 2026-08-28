import type { SourceBasslineActualBars, SourceBasslinePracticeLevel, SourceBasslineWindowBars } from "./sourceBasslinePractice";

export const SOURCE_BASSLINE_HISTORY_VERSION = 1 as const;

export type SourceBasslineHarmonyComparison = "match" | "mismatch" | "comparison-unavailable";

export interface SourceBasslineHistoryEntry {
  readonly id: string;
  readonly version: typeof SOURCE_BASSLINE_HISTORY_VERSION;
  readonly completedAt: string;
  readonly source: {
    readonly kind: "source-bassline";
    readonly reference: {
      readonly ideaId: string;
      readonly blockId: string;
    };
    readonly snapshotSchemaVersion: 1;
    readonly snapshotSignature: string;
    readonly capturedHarmonySignature?: string;
  };
  readonly window: {
    readonly requestedBars: SourceBasslineWindowBars;
    readonly startBar: number;
    readonly endBar: number;
    readonly actualBars: SourceBasslineActualBars;
  };
  readonly level: SourceBasslinePracticeLevel;
  readonly monophonicProjection: true;
  readonly facts: {
    readonly croppedSourceNoteCount: number;
    readonly projectedNoteCount: number;
    readonly omittedSimultaneousNoteCount: number;
    readonly boundaryClippedNoteCount: number;
    readonly overlapClippedNoteCount: number;
    readonly pitchReplacementCount: number;
  };
  readonly capturedHarmonyComparison: SourceBasslineHarmonyComparison;
  readonly selfReview: "completed";
  /** Opaque P5.17 retained-take id; audio and device facts are never duplicated. */
  readonly retainedTakeReference?: string;
}

export interface CreateSourceBasslineHistoryEntryInput {
  readonly id: string;
  readonly completedAt: string;
  readonly reference: Readonly<{ readonly ideaId: string; readonly blockId: string }>;
  readonly snapshotSignature: string;
  readonly capturedHarmonySignature?: string;
  readonly requestedBars: SourceBasslineWindowBars;
  readonly startBar: number;
  readonly endBar: number;
  readonly actualBars: SourceBasslineActualBars;
  readonly level: SourceBasslinePracticeLevel;
  readonly croppedSourceNoteCount: number;
  readonly projectedNoteCount: number;
  readonly omittedSimultaneousNoteCount: number;
  readonly boundaryClippedNoteCount: number;
  readonly overlapClippedNoteCount: number;
  readonly pitchReplacementCount: number;
  readonly capturedHarmonyComparison: SourceBasslineHarmonyComparison;
  readonly retainedTakeReference?: string;
}

export function createSourceBasslineHistoryEntry(
  input: CreateSourceBasslineHistoryEntryInput,
): SourceBasslineHistoryEntry {
  return deepFreeze({
    id: input.id,
    version: SOURCE_BASSLINE_HISTORY_VERSION,
    completedAt: input.completedAt,
    source: {
      kind: "source-bassline",
      reference: { ideaId: input.reference.ideaId, blockId: input.reference.blockId },
      snapshotSchemaVersion: 1,
      snapshotSignature: input.snapshotSignature,
      ...(input.capturedHarmonySignature === undefined ? {} : { capturedHarmonySignature: input.capturedHarmonySignature }),
    },
    window: {
      requestedBars: input.requestedBars,
      startBar: input.startBar,
      endBar: input.endBar,
      actualBars: input.actualBars,
    },
    level: input.level,
    monophonicProjection: true,
    facts: {
      croppedSourceNoteCount: input.croppedSourceNoteCount,
      projectedNoteCount: input.projectedNoteCount,
      omittedSimultaneousNoteCount: input.omittedSimultaneousNoteCount,
      boundaryClippedNoteCount: input.boundaryClippedNoteCount,
      overlapClippedNoteCount: input.overlapClippedNoteCount,
      pitchReplacementCount: input.pitchReplacementCount,
    },
    capturedHarmonyComparison: input.capturedHarmonyComparison,
    selfReview: "completed",
    ...(input.retainedTakeReference === undefined ? {} : { retainedTakeReference: input.retainedTakeReference }),
  });
}

export type SourceBasslineHistoryResolution<T> =
  | { readonly available: true; readonly asset: T }
  | { readonly available: false; readonly reason: "missing-source" | "snapshot-mismatch" };

export function resolveSourceBasslineHistory<T extends {
  readonly reference: Readonly<{ readonly ideaId: string; readonly blockId: string }>;
  readonly sourceBassline: {
    readonly snapshotSignature: string;
    readonly capturedHarmony?: { readonly signature: string };
  };
}>(entry: SourceBasslineHistoryEntry, assets: readonly T[]): SourceBasslineHistoryResolution<T> {
  const sameReference = assets.find((asset) => (
    asset.reference.ideaId === entry.source.reference.ideaId
    && asset.reference.blockId === entry.source.reference.blockId
  ));
  if (!sameReference) return Object.freeze({ available: false, reason: "missing-source" });
  if (sameReference.sourceBassline.snapshotSignature !== entry.source.snapshotSignature) {
    return Object.freeze({ available: false, reason: "snapshot-mismatch" });
  }
  if (
    entry.source.capturedHarmonySignature !== undefined
    && sameReference.sourceBassline.capturedHarmony?.signature !== entry.source.capturedHarmonySignature
  ) {
    return Object.freeze({ available: false, reason: "snapshot-mismatch" });
  }
  return Object.freeze({ available: true, asset: sameReference });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
