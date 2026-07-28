import { describe, expect, it } from "vitest";
import { makeChordSymbol } from "../../src/domain/chords";
import {
  buildSameRootOracleRow,
  summarizeSameRootOracle,
} from "./sameRootOracle";

const rawWindow = {
  bar: 1,
  beat: 1,
  durationBeats: 2,
  totalWeight: 1,
  melodyWeight: 0,
  noteCount: 4,
  candidates: [
    { chord: makeChordSymbol(0, "maj7"), rawScore: 1 },
    { chord: makeChordSymbol(0, "maj9"), rawScore: 0.9 },
    { chord: makeChordSymbol(0, "add9"), rawScore: 0.8 },
    { chord: makeChordSymbol(7, "dom7"), rawScore: 0.7 },
  ],
};

describe("Phase 4.5 same-root oracle", () => {
  it("keeps rank 1 and fills only from its root pool", () => {
    const row = buildSameRootOracleRow({
      fileId: "f",
      eventId: "e",
      scenarioId: "V01",
      expected: "Cmaj9",
      currentCandidates: ["Cmaj7", "G7", "Am7"],
      rawWindow,
    });
    expect(row.oracleCandidates).toEqual(["Cmaj7", "Cmaj9", "Cadd9"]);
    expect(row.rank1Invariant).toBe(true);
    expect(row.gainedCanonicalRescue).toBe(true);
  });

  it("counts root rescue losses independently from canonical gains", () => {
    const gain = buildSameRootOracleRow({
      fileId: "f",
      eventId: "gain",
      scenarioId: "V01",
      expected: "Cmaj9",
      currentCandidates: ["Cmaj7", "G7", "Am7"],
      rawWindow,
    });
    const loss = buildSameRootOracleRow({
      fileId: "f",
      eventId: "loss",
      scenarioId: "V02",
      expected: "G7",
      currentCandidates: ["Cmaj7", "G7", "Am7"],
      rawWindow,
    });
    const summary = summarizeSameRootOracle([gain, loss]);
    expect(summary.gainedCanonicalRescueCount).toBe(1);
    expect(summary.lostRootRescueCount).toBe(1);
    expect(summary.netRescueCount).toBe(0);
  });
});
