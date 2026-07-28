import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../src/domain/chords";
import {
  buildCandidateFunnelRow,
  summarizeCandidateFunnel,
} from "./candidateFunnel";

function window(labels: string[]) {
  return {
    bar: 1,
    beat: 1,
    durationBeats: 2,
    totalWeight: 1,
    melodyWeight: 0,
    noteCount: 4,
    candidates: labels.map((label, index) => ({
      chord: label === "Cmaj7"
        ? makeChordSymbol(0, "maj7")
        : label === "Cmaj9"
          ? makeChordSymbol(0, "maj9")
          : makeChordSymbol(7, "dom7"),
      rawScore: 1 - index * 0.1,
    })),
  };
}

describe("Phase 4.5 candidate recall funnel", () => {
  it("distinguishes allocation loss from generation loss", () => {
    const allocationLoss = buildCandidateFunnelRow({
      fileId: "f",
      eventId: "e1",
      startBeat: 0,
      endBeat: 4,
      expected: "Cmaj9",
      detectedRank1: "Cmaj7",
      displayedCandidates: ["Cmaj7", "G7"],
      rawWindow: window(["Cmaj7", "Cmaj9", "G7"]),
    });
    const generationLoss = buildCandidateFunnelRow({
      fileId: "f",
      eventId: "e2",
      startBeat: 4,
      endBeat: 8,
      expected: "Cmaj9",
      detectedRank1: "Cmaj7",
      displayedCandidates: ["Cmaj7", "G7"],
      rawWindow: window(["Cmaj7", "G7"]),
    });

    expect(allocationLoss.firstDropStage).toBe("allocated-top3");
    expect(allocationLoss.sameRootRank).toBe(2);
    expect(generationLoss.firstDropStage).toBe("raw-generation");
  });

  it("reports recall and first-drop counts from event rows", () => {
    const rows = [
      buildCandidateFunnelRow({
        fileId: "f",
        eventId: "e1",
        startBeat: 0,
        endBeat: 4,
        expected: "Cmaj9",
        detectedRank1: "Cmaj7",
        displayedCandidates: ["Cmaj7", "Cmaj9", "G7"],
        rawWindow: window(["Cmaj7", "Cmaj9", "G7"]),
      }),
      buildCandidateFunnelRow({
        fileId: "f",
        eventId: "e2",
        startBeat: 4,
        endBeat: 8,
        expected: "Cmaj9",
        detectedRank1: "Cmaj7",
        displayedCandidates: ["Cmaj7", "G7"],
        rawWindow: window(["Cmaj7", "G7"]),
      }),
    ];

    const summary = summarizeCandidateFunnel(rows);
    expect(summary.rawCandidateRecall).toBe(0.5);
    expect(summary.displayedTop3Canonical).toBe(0.5);
    expect(summary.firstDropStageCounts["raw-generation"]).toBe(1);
  });
});
