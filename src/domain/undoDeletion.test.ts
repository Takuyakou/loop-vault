import { describe, expect, it } from "vitest";
import { makeIdea } from "./testFactory";
import type { SavedProgressionBlock } from "./types";
import {
  applyPendingDeletions,
  createUndoSnapshot,
  ideaAnchor,
  progressionBlockAnchor,
  removeUndoSnapshot,
  type PendingDeletion,
} from "./undoDeletion";

function block(id: string): SavedProgressionBlock {
  return {
    id,
    summaryText: id,
    chords: [],
    tags: [],
    capturedAt: "2026-07-16T00:00:00.000Z",
    analyzerVersion: "test",
  };
}

describe("pending deletion projection", () => {
  it("keeps consecutive child deletions correct in either commit order", () => {
    const original = [block("block-1"), block("block-2"), block("block-3")];
    const second = createUndoSnapshot(original, 1, "idea-1", progressionBlockAnchor)!;
    const afterSecond = removeUndoSnapshot(original, second, progressionBlockAnchor);
    const third = createUndoSnapshot(afterSecond, 1, "idea-1", progressionBlockAnchor)!;

    const secondThenThird = removeUndoSnapshot(
      removeUndoSnapshot(original, second, progressionBlockAnchor),
      third,
      progressionBlockAnchor,
    );
    const thirdThenSecond = removeUndoSnapshot(
      removeUndoSnapshot(original, third, progressionBlockAnchor),
      second,
      progressionBlockAnchor,
    );

    expect(secondThenThird.map((entry) => entry.id)).toEqual(["block-1"]);
    expect(thirdThenSecond.map((entry) => entry.id)).toEqual(["block-1"]);
  });

  it("preserves child data while a parent Idea is pending and after parent undo", () => {
    const blocks = [block("block-1"), block("block-2")];
    const idea = makeIdea({ id: "idea-1", progressionBlocks: blocks });
    const ideas = [idea, makeIdea({ id: "idea-2" })];
    const child: PendingDeletion = {
      kind: "progressionBlock",
      vaultEpoch: 3,
      snapshot: createUndoSnapshot(blocks, 1, idea.id, progressionBlockAnchor)!,
    };
    const parent: PendingDeletion = {
      kind: "idea",
      vaultEpoch: 3,
      snapshot: createUndoSnapshot(ideas, 0, "vault", ideaAnchor)!,
    };

    expect(applyPendingDeletions(ideas, [child, parent], 3).map((entry) => entry.id))
      .toEqual(["idea-2"]);
    expect(applyPendingDeletions(ideas, [child], 3)[0]?.progressionBlocks?.map((entry) => entry.id))
      .toEqual(["block-1"]);
    expect(ideas[0]?.progressionBlocks?.map((entry) => entry.id))
      .toEqual(["block-1", "block-2"]);
  });

  it("does not project pending IDs from an older Vault epoch", () => {
    const idea = makeIdea({ id: "shared-id" });
    const pending: PendingDeletion = {
      kind: "idea",
      vaultEpoch: 1,
      snapshot: createUndoSnapshot([idea], 0, "vault", ideaAnchor)!,
    };

    expect(applyPendingDeletions([idea], [pending], 2)).toEqual([idea]);
  });
});
