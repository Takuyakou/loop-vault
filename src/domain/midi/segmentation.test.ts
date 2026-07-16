import { describe, expect, it } from "vitest";
import { normalizeNotes } from "./normalize";
import { buildSegmentLattice, generateBoundaries } from "./segmentation";

function notes(events: Array<[number, number, number]>) {
  return normalizeNotes({ notes: events.map(([pitch, beat, duration]) => ({ pitch, startTick: beat * 480, durationTick: duration * 480, velocity: 0.8, trackIndex: 0 })),
    ticksPerBeat: 480, totalBars: 2, tracks: [{ index: 0, name: "Piano" }], controlChanges: [] });
}

describe("adaptive segmentation", () => {
  it("keeps bar boundaries and admits a strong two-chord midpoint", () => {
    const normalized = notes([[60, 0, 2], [64, 0, 2], [67, 0, 2], [62, 2, 2], [65, 2, 2], [69, 2, 2]]);
    const boundaries = generateBoundaries(normalized, { beatsPerBar: 4, totalBeats: 4 });
    expect(boundaries.find((entry) => entry.beat === 2)?.reasons).toContain("strong-onset-burst");
    expect(buildSegmentLattice(normalized, boundaries, { beatsPerBar: 4, totalBeats: 4 })
      .some((segment) => segment.startBeat === 0 && segment.endBeat === 2)).toBe(true);
  });

  it("caps lattice branching on long input", () => {
    const normalized = notes(Array.from({ length: 32 }, (_, index) => [60 + index % 3, index / 2, 0.5] as [number, number, number]));
    const boundaries = generateBoundaries(normalized, { beatsPerBar: 4, totalBeats: 16 });
    const lattice = buildSegmentLattice(normalized, boundaries, { beatsPerBar: 4, totalBeats: 16, maxEndsPerStart: 4 });
    expect(lattice.length).toBeLessThanOrEqual(boundaries.length * 4);
  });
});
