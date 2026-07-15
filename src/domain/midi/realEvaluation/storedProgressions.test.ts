import { describe, expect, it } from "vitest";
import type { ChordTimelineItem, SavedProgressionBlock, VaultFile } from "../../types";
import { realMidiEvaluationCaseSchema } from "./schema";
import {
  buildStoredProgressionCase,
  compareStoredProgression,
  enumerateStoredProgressions,
  resolveStoredProgressionRange,
} from "./storedProgressions";

const chord = (label: string, bar: number): ChordTimelineItem => ({
  bar,
  beat: 1,
  durationBeats: 4,
  chord: { root: label === "Dm" ? 2 : 0, quality: label === "Dm" ? "min" : "maj", tensions: [], label },
  confidence: 0.9,
  alternatives: [],
  warnings: [],
});

const block: SavedProgressionBlock = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceAssetId: "22222222-2222-4222-8222-222222222222",
  sourceFileName: "song.mid",
  startBar: 1,
  endBar: 2,
  lengthBars: 2,
  summaryText: "C - Dm",
  chords: [chord("C", 1), chord("Dm", 2)],
  tags: [],
  capturedAt: "2026-07-15T00:00:00.000Z",
  analyzerVersion: "legacy-v1",
};

const vault: VaultFile = {
  app: "loopvault",
  fileVersion: 1,
  settings: { monthlyGoal: 1, language: "ja" },
  ideas: [{
    id: "33333333-3333-4333-8333-333333333333",
    title: "Idea",
    moods: [],
    status: "idea",
    nextAction: { text: "", updatedAt: "2026-07-15T00:00:00.000Z" },
    chordMemo: "",
    references: [],
    assets: [{ id: block.sourceAssetId!, type: "midi", path: "D:/music/song.mid" }],
    progressionBlocks: [block],
    statusHistory: [{ status: "idea", at: "2026-07-15T00:00:00.000Z" }],
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  }],
};

describe("stored progression regression", () => {
  it("enumerates blocks with their source asset", () => {
    const [reference] = enumerateStoredProgressions(vault);
    expect(reference.asset?.path).toBe("D:/music/song.mid");
    expect(reference.block.id).toBe(block.id);
  });

  it("resolves a beat range and defaults unknown legacy saves to Bronze", () => {
    expect(resolveStoredProgressionRange(block)).toEqual({ startBeat: 0, endBeat: 8 });
    const [reference] = enumerateStoredProgressions(vault);
    const result = buildStoredProgressionCase(reference, `sha256-${"a".repeat(64)}`);
    expect(result?.label).toEqual({ strength: "bronze", origin: "implicit-save" });
    expect(realMidiEvaluationCaseSchema.parse(result)).toEqual(result);
    expect(JSON.stringify(result)).not.toContain("D:/music");
  });

  it("compares legacy and reranker on the saved ranges", () => {
    const [reference] = enumerateStoredProgressions(vault);
    const expected = buildStoredProgressionCase(reference, `sha256-${"b".repeat(64)}`)!.expected.primary;
    const comparison = compareStoredProgression(expected, block.chords, [chord("C", 1), chord("C", 2)]);
    expect(comparison.map((item) => item.legacyMatches)).toEqual([true, true]);
    expect(comparison.map((item) => item.rerankerMatches)).toEqual([true, false]);
  });
});
