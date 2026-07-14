import { describe, expect, it } from "vitest";
import { normalizeNotes } from "./normalize";
import { extractOrnamentFeatures } from "./ornaments";

describe("context-free ornament features", () => {
  it("attenuates a short stepwise passing note without deleting it", () => {
    const data = { notes: [60, 62, 64].map((pitch, index) => ({ pitch, startTick: index * 240, durationTick: 240, velocity: 0.8, trackIndex: 0 })),
      ticksPerBeat: 480, totalBars: 1, tracks: [{ index: 0, name: "Melody" }], controlChanges: [] };
    const notes = normalizeNotes(data);
    const middle = extractOrnamentFeatures(notes).get(notes[1]);
    expect(middle?.passingTone).toBe(true);
    expect(middle!.penalty).toBeGreaterThan(0);
    expect(middle!.penalty).toBeLessThan(1);
  });
});
