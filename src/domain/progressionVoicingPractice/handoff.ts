import type { SavedProgressionBlock, SongIdea } from "../types";
import {
  TEXT_PROGRESSION_ANALYZER_VERSION,
  TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM,
} from "../textProgression";
import { buildProgressionVoicingPracticeSnapshot } from "./snapshot";
import type {
  ProgressionPracticeSourceReference,
  ProgressionVoicingPracticeHandoffResult,
  ProgressionVoicingPracticeSnapshot,
  ProgressionVoicingPracticeSnapshots,
  ProgressionVoicingSelection,
} from "./types";

const HANDOFF_SELECTIONS: readonly ProgressionVoicingSelection[] = Object.freeze([
  "source-midi",
  "custom",
  "basic-shell",
  "basic-full",
  "full-shell",
  "left-hand",
]);

/**
 * Re-reads one saved Vault block and detaches all P5.27 practice choices.
 * A caller keeps the returned handoff as session-owned state; it is never
 * live-bound to the Vault collection passed here.
 */
export function buildProgressionVoicingPracticeHandoffFromVault(
  ideas: readonly SongIdea[],
  sourceReference: ProgressionPracticeSourceReference,
): ProgressionVoicingPracticeHandoffResult {
  const idea = ideas.find((candidate) => candidate.id === sourceReference.ideaId);
  const block = idea?.progressionBlocks?.find(
    (candidate) => candidate.id === sourceReference.blockId,
  );
  if (!idea || !block) {
    return { ok: false, error: { code: "source-unavailable" } };
  }

  const effectiveBpm = block.bpm
    ?? idea.bpm
    ?? (block.analyzerVersion === TEXT_PROGRESSION_ANALYZER_VERSION
      ? TEXT_PROGRESSION_RUNTIME_DEFAULT_BPM
      : undefined);
  const effectiveBlock: SavedProgressionBlock = {
    ...block,
    chords: block.chords,
    ...(effectiveBpm === undefined ? {} : { bpm: effectiveBpm }),
    ...(block.detectedKey === undefined && isCanonicalPracticeKey(idea.key)
      ? { detectedKey: idea.key }
      : {}),
  };
  const snapshots: Partial<Record<ProgressionVoicingSelection, ProgressionVoicingPracticeSnapshot>> = {};
  for (const selection of HANDOFF_SELECTIONS) {
    const result = buildProgressionVoicingPracticeSnapshot({
      sourceReference,
      block: effectiveBlock,
      selection,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: { code: "invalid-source", cause: result.error.code },
      };
    }
    snapshots[selection] = result.snapshot;
  }

  const detachedSnapshots = Object.freeze({ ...snapshots }) as ProgressionVoicingPracticeSnapshots;
  return {
    ok: true,
    handoff: Object.freeze({
      sourceReference: Object.freeze({ ...sourceReference }),
      snapshots: detachedSnapshots,
      initialSelection: preferredInitialSelection(detachedSnapshots),
    }),
  };
}

function isCanonicalPracticeKey(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-G](?:#|b){0,2} (?:major|minor)$/.test(value.trim());
}

function preferredInitialSelection(
  snapshots: ProgressionVoicingPracticeSnapshots,
): ProgressionVoicingSelection {
  if (hasCompleteExactVoicing(snapshots["source-midi"], "source-midi")) return "source-midi";
  if (hasCompleteExactVoicing(snapshots.custom, "custom")) return "custom";
  return "basic-full";
}

function hasCompleteExactVoicing(
  snapshot: ProgressionVoicingPracticeSnapshot | undefined,
  kind: "source-midi" | "custom",
): boolean {
  return Boolean(snapshot?.events.length)
    && snapshot!.events.every((event) => event.voicing?.kind === kind);
}
