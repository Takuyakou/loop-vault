import type { ChordContextListenMode, ChordContextPlayMode } from "../application/chordContextPlayback";
import type { ChordContextSnapshot } from "./chordContextSnapshot";

/**
 * A factual, Vault-independent record of a completed Chord Context session.
 *
 * This deliberately stores only the immutable snapshot facts that a person
 * selected for practice. It never contains audio, a source path, a Vault
 * mutation, automatic evaluation, or a player-performance judgement.
 */
export const CHORD_CONTEXT_HISTORY_VERSION = 1 as const;

export interface ChordContextHistoryEntry {
  readonly id: string;
  readonly version: typeof CHORD_CONTEXT_HISTORY_VERSION;
  readonly completedAt: string;
  readonly source: {
    readonly kind: "generated" | "vault";
    readonly safeLabel: string;
    readonly reference?: {
      readonly ideaId: string;
      readonly blockId: string;
    };
  };
  readonly snapshotSignature: string;
  readonly section: {
    readonly id: string;
    readonly startBar: number;
    readonly endBar: number;
    readonly lengthBeats: 4 | 8;
  };
  readonly originalBpm: number;
  readonly effectiveBpm: number;
  readonly listenMode: ChordContextListenMode;
  readonly playMode: ChordContextPlayMode;
  readonly metronomeUsed: boolean;
  readonly recordCompareUsed: boolean;
  /** Opaque P5.17 retained-take id; no audio or device metadata is duplicated. */
  readonly retainedTakeReference?: string;
}

export interface CreateChordContextHistoryEntryInput {
  readonly id: string;
  readonly completedAt: string;
  readonly snapshot: ChordContextSnapshot;
  readonly effectiveBpm: number;
  readonly listenMode: ChordContextListenMode;
  readonly playMode: ChordContextPlayMode;
  /** True only when metronome events were successfully scheduled for this factual session. */
  readonly metronomeUsed: boolean;
  readonly recordCompareUsed: boolean;
  readonly retainedTakeReference?: string;
}

export function createChordContextHistoryEntry(
  input: CreateChordContextHistoryEntryInput,
): ChordContextHistoryEntry {
  const { snapshot } = input;
  const source = snapshot.source.kind === "vault"
    ? {
      kind: "vault" as const,
      safeLabel: snapshot.source.safeLabel,
      reference: {
        ideaId: snapshot.source.reference.ideaId,
        blockId: snapshot.source.reference.blockId,
      },
    }
    : { kind: "generated" as const, safeLabel: snapshot.source.safeLabel };
  return {
    id: input.id,
    version: CHORD_CONTEXT_HISTORY_VERSION,
    completedAt: input.completedAt,
    source,
    snapshotSignature: snapshot.signature,
    section: {
      id: snapshot.section.id,
      startBar: snapshot.section.startBar,
      endBar: snapshot.section.endBar,
      lengthBeats: snapshot.section.lengthBeats,
    },
    originalBpm: snapshot.originalBpm,
    effectiveBpm: input.effectiveBpm,
    listenMode: input.listenMode,
    playMode: input.playMode,
    metronomeUsed: input.metronomeUsed,
    recordCompareUsed: input.recordCompareUsed,
    ...(input.retainedTakeReference === undefined
      ? {}
      : { retainedTakeReference: input.retainedTakeReference }),
  };
}