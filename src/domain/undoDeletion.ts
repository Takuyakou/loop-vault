import type { SavedProgressionBlock, SongIdea } from "./types";

export interface UndoSnapshot<T> {
  parentId: string;
  index: number;
  value: T;
  targetAnchor: string;
  beforeAnchor?: string;
  afterAnchor?: string;
}

export type PendingDeletion =
  | { kind: "idea"; vaultEpoch: number; snapshot: UndoSnapshot<SongIdea> }
  | {
      kind: "progressionBlock";
      vaultEpoch: number;
      snapshot: UndoSnapshot<SavedProgressionBlock>;
    }
  | {
      kind: "reference";
      vaultEpoch: number;
      snapshot: UndoSnapshot<SongIdea["references"][number]>;
    }
  | {
      kind: "asset";
      vaultEpoch: number;
      snapshot: UndoSnapshot<SongIdea["assets"][number]>;
    };

export type PendingIdeaDeletion = Extract<PendingDeletion, { kind: "idea" }>;
export type PendingProgressionBlockDeletion = Extract<
  PendingDeletion,
  { kind: "progressionBlock" }
>;
export type PendingReferenceDeletion = Extract<
  PendingDeletion,
  { kind: "reference" }
>;
export type PendingAssetDeletion = Extract<PendingDeletion, { kind: "asset" }>;

export function createUndoSnapshot<T>(
  items: T[],
  index: number,
  parentId: string,
  anchorOf: (value: T) => string = stableValueAnchor,
): UndoSnapshot<T> | undefined {
  const value = items[index];
  if (value === undefined || index < 0) return undefined;
  return {
    parentId,
    index,
    value,
    targetAnchor: anchorOf(value),
    ...(index > 0 ? { beforeAnchor: anchorOf(items[index - 1]!) } : {}),
    ...(index + 1 < items.length
      ? { afterAnchor: anchorOf(items[index + 1]!) }
      : {}),
  };
}

export function resolveUndoSnapshotIndex<T>(
  items: T[],
  snapshot: UndoSnapshot<T>,
  anchorOf: (value: T) => string = stableValueAnchor,
): number {
  const candidates = items
    .map((value, index) => ({ index, anchor: anchorOf(value) }))
    .filter((candidate) => candidate.anchor === snapshot.targetAnchor);
  if (candidates.length === 0) return -1;
  if (candidates.length === 1) return candidates[0]!.index;

  return candidates
    .map(({ index }) => ({
      index,
      score:
        (snapshot.beforeAnchor !== undefined &&
        index > 0 &&
        anchorOf(items[index - 1]!) === snapshot.beforeAnchor
          ? 4
          : 0) +
        (snapshot.afterAnchor !== undefined &&
        index + 1 < items.length &&
        anchorOf(items[index + 1]!) === snapshot.afterAnchor
          ? 4
          : 0) -
        Math.abs(index - snapshot.index) / Math.max(items.length, 1),
    }))
    .sort((left, right) => right.score - left.score)[0]!.index;
}

export function removeUndoSnapshot<T>(
  items: T[],
  snapshot: UndoSnapshot<T>,
  anchorOf: (value: T) => string = stableValueAnchor,
): T[] {
  const index = resolveUndoSnapshotIndex(items, snapshot, anchorOf);
  if (index < 0) return items;
  return items.filter((_, itemIndex) => itemIndex !== index);
}

export function isPendingDeletion(value: unknown): value is PendingDeletion {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: unknown }).kind;
  return (
    kind === "idea" ||
    kind === "progressionBlock" ||
    kind === "reference" ||
    kind === "asset"
  );
}

export function applyPendingDeletions(
  ideas: SongIdea[],
  deletions: PendingDeletion[],
  vaultEpoch?: number,
): SongIdea[] {
  const currentDeletions = vaultEpoch === undefined
    ? deletions
    : deletions.filter((deletion) => deletion.vaultEpoch === vaultEpoch);
  if (currentDeletions.length === 0) return ideas;
  let visibleIdeas = ideas;
  for (const deletion of currentDeletions) {
    if (deletion.kind === "idea") {
      visibleIdeas = removeUndoSnapshot(
        visibleIdeas,
        deletion.snapshot,
        ideaAnchor,
      );
    }
  }

  return visibleIdeas.map((idea) => {
    let progressionBlocks = idea.progressionBlocks ?? [];
    let references = idea.references;
    let assets = idea.assets;
    for (const deletion of currentDeletions) {
      if (deletion.snapshot.parentId !== idea.id) continue;
      if (deletion.kind === "progressionBlock") {
        progressionBlocks = removeUndoSnapshot(
          progressionBlocks,
          deletion.snapshot,
          progressionBlockAnchor,
        );
      } else if (deletion.kind === "reference") {
        references = removeUndoSnapshot(references, deletion.snapshot);
      } else if (deletion.kind === "asset") {
        assets = removeUndoSnapshot(assets, deletion.snapshot, assetAnchor);
      }
    }
    return { ...idea, progressionBlocks, references, assets };
  });
}

export function ideaAnchor(idea: SongIdea): string {
  return idea.id;
}

export function progressionBlockAnchor(block: SavedProgressionBlock): string {
  return block.id;
}

export function assetAnchor(asset: SongIdea["assets"][number]): string {
  return asset.id;
}

export function stableValueAnchor(value: unknown): string {
  return JSON.stringify(value);
}
