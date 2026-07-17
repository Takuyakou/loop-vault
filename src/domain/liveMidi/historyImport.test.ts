import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../chords";
import { savedProgressionBlockSchema } from "../schema";
import { historyToSavedProgressionBlock } from "./historyImport";

const history = ["C", "Dm", "G7"].map((label, index) => ({
  id: String(index),
  chord: index === 0 ? makeChordSymbol(0, "maj") : index === 1 ? makeChordSymbol(2, "min") : makeChordSymbol(7, "dom7"),
  label,
  notes: [60 + index],
  startedAtMs: index * 500,
  committedAtMs: index * 500 + 400,
}));

describe("historyToSavedProgressionBlock", () => {
  it("converts only the selected range with honest live metadata", () => {
    const block = historyToSavedProgressionBlock(history, 1, 3, {
      id: "00000000-0000-4000-8000-000000000001",
      capturedAt: "2026-07-17T00:00:00.000Z",
    });
    expect(block).toMatchObject({
      origin: "live-midi",
      summaryText: "Dm - G7",
      analyzerVersion: "live-chord-v1",
      userVerified: false,
    });
    expect(block).not.toHaveProperty("confidence");
    expect(block?.chords.every((item) => item.confidence === 0)).toBe(true);
    expect(savedProgressionBlockSchema.safeParse(block).success).toBe(true);
  });

  it("returns undefined for an empty range", () => {
    expect(historyToSavedProgressionBlock(history, 2, 2, {
      id: "00000000-0000-4000-8000-000000000001",
      capturedAt: "2026-07-17T00:00:00.000Z",
    })).toBeUndefined();
  });
});
