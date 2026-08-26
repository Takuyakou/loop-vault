import { expect, it } from "vitest";
import { consolidateP524PerformanceFragments } from "./fragmentConsolidator";
import type { P524ShadowInput, P524ShadowNote } from "./shadowEvidence";

it("keeps 20,000 normalized notes and 1,250 cells bounded and order-invariant", { timeout: 10_000 }, () => {
  const notes: P524ShadowNote[] = [];
  for (let attack = 0; attack < 5_000; attack += 1) {
    for (const [offset, pitch] of [36, 52, 55, 60].entries()) {
      notes.push({
        id: `scale-${attack}-${offset}`,
        pitch,
        startBeat: attack,
        durationBeats: 0.85,
        velocity: 0.8,
      });
    }
  }
  const input: P524ShadowInput = { notes, meter: [4, 4], totalBeats: 5_000 };
  const started = performance.now();
  const first = consolidateP524PerformanceFragments(input);
  const reversed = consolidateP524PerformanceFragments({ ...input, notes: [...notes].reverse() });
  expect(first).toMatchObject({
    status: "supported",
    harmonicRhythm: 4,
    legacyFallback: false,
    states: [{ startBeat: 0, endBeat: 5_000, pitchClasses: [0, 4, 7], label: "C" }],
    operations: {
      inputNotes: 20_000,
      cells: 1_250,
      noteIntervalSearches: 30_000,
      profileSweepCells: 15_000,
      boundaryDecisions: 1_249,
    },
  });
  expect(reversed).toEqual(first);
  expect(performance.now() - started).toBeLessThan(10_000);
});
