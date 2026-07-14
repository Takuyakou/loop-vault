import { describe, expect, it } from "vitest";
import { normalizeNotes, overlapWithSegment } from "./normalize";
import { beatStrength, defaultAnalyzerWeights, noteFeatures } from "./weights";

describe("MIDI note weights", () => {
  it("ranks downbeats above offbeats without assuming only 4/4", () => {
    expect(beatStrength(0, 3, defaultAnalyzerWeights)).toBeGreaterThan(beatStrength(1.5, 3, defaultAnalyzerWeights));
  });

  it("gives a sustained middle-register note more evidence than a short upper note", () => {
    const data = { notes: [
      { pitch: 60, startTick: 0, durationTick: 480, velocity: 0.8, trackIndex: 0 },
      { pitch: 84, startTick: 0, durationTick: 60, velocity: 0.8, trackIndex: 0 },
    ], ticksPerBeat: 480, totalBars: 1, tracks: [{ index: 0, name: "Piano" }], controlChanges: [] };
    const notes = normalizeNotes(data);
    const features = notes.map((note) => noteFeatures(overlapWithSegment(note, { startBeat: 0, endBeat: 1 }), { beatsPerBar: 4, roleWeight: 1 }));
    expect(features[0].finalWeight).toBeGreaterThan(features[1].finalWeight);
  });
});
