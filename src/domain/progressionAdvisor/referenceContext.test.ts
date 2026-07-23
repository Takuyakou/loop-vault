import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import { buildProgressionIndex } from "../progressionClassification/mod";
import type { SavedProgressionBlock, SongIdea } from "../types";
import { buildAdvisorRequest } from "./requestBuilder";
import { selectAdvisorReferenceContexts } from "./referenceContext";

function block(id: string, root: number, flags: Partial<SavedProgressionBlock> = {}): SavedProgressionBlock {
  return {
    id,
    summaryText: `block ${id}`,
    chords: [{ bar: 1, beat: 1, durationBeats: 4, chord: makeChordSymbol(root, "maj7"), confidence: 1, alternatives: [], warnings: [] }],
    tags: ["mood.dreamy", "use.loop"],
    capturedAt: "2026-07-22T00:00:00.000Z",
    analyzerVersion: "test",
    detectedKey: "C",
    ...flags,
  };
}

function idea(id: string, blocks: SavedProgressionBlock[]): SongIdea {
  return {
    id, title: `Idea ${id}`, status: "idea", moods: [], nextAction: { text: "", updatedAt: "2026-07-22T00:00:00.000Z" }, chordMemo: "private memo", references: [], assets: [], progressionBlocks: blocks, statusHistory: [], createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z",
  };
}

describe("Advisor reference context", () => {
  it("selects at most three accepted references deterministically", () => {
    const current = block("current", 0);
    const index = buildProgressionIndex([
      idea("current", [current]),
      idea("references", [
        block("verified", 2, { userVerified: true }),
        block("edited", 4, { userEdited: true }),
        block("favorite", 5, { pinned: true }),
        block("extra", 7, { userVerified: true }),
        block("ignored", 9),
      ]),
    ]);
    const input = { index, currentBlockId: current.id, key: "C", tagIds: current.tags };

    const first = selectAdvisorReferenceContexts(input);
    expect(first).toHaveLength(3);
    expect(first).toEqual(selectAdvisorReferenceContexts(input));
    expect(first.some((entry) => entry.verified)).toBe(true);
  });

  it("serializes only the approved progression context", () => {
    const unsafe = block("unsafe", 0, {
      sourceFileName: "secret.mid",
      memo: "do not send this memo",
      sourceFingerprint: "fingerprint",
      sourceAssetId: "asset-id",
    });
    const context = [{ key: "C", mode: "major", romanNumerals: ["I"], chordLabels: ["Cmaj7"], tagIds: ["mood.dreamy"], verified: true }];
    const request = buildAdvisorRequest(unsafe, { title: "Allowed title", context });
    const serialized = JSON.stringify(request);

    expect(serialized).toContain("Cmaj7");
    expect(serialized).not.toContain("secret.mid");
    expect(serialized).not.toContain("do not send this memo");
    expect(serialized).not.toContain("fingerprint");
    expect(serialized).not.toContain("asset-id");
    expect(serialized).not.toContain("sourceFileName");
    expect(serialized).not.toContain("apiKey");
    expect(request.context).toHaveLength(1);
  });
});
