import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { analyzeMidi, defaultAnalyzerMode } from "./analysis";
import { buildHybridPipeline, timelineFromHybridPipeline } from "./hybrid";

function bytes(): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(100);
  const track = midi.addTrack();
  track.name = "Rhodes chords";
  [[60, 64, 67], [65, 69, 72], [67, 71, 74], [60, 64, 67]].forEach((chord, bar) =>
    chord.forEach((pitch) => track.addNote({ midi: pitch, ticks: bar * 1920, durationTicks: 1920, velocity: 0.8 })));
  return new Uint8Array(midi.toArray());
}

describe("hybrid MIDI analyzer", () => {
  it("is deterministic and retains the legacy mode", () => {
    const hybrid = analyzeMidi(bytes(), { mode: "hybrid-v1" });
    expect(hybrid).toEqual(analyzeMidi(bytes(), { mode: "hybrid-v1" }));
    expect(hybrid.analyzerVersion).toBe("hybrid-symbolic-v1");
    expect(defaultAnalyzerMode).toBe("phase4-v1");
    expect(analyzeMidi(bytes(), { mode: "legacy" }).analyzerVersion).toBe("legacy-v1");
  });

  it("produces a full timeline, alternatives, and block candidates", () => {
    const result = analyzeMidi(bytes(), { mode: "hybrid-v1" });
    expect(result.fullTimeline.length).toBeGreaterThan(0);
    expect(result.fullTimeline[0].alternatives.length).toBeGreaterThan(0);
    expect(result.fullTimeline.every((item) => item.alternatives.length <= 5)).toBe(true);
    expect(result.blockCandidates[0]?.lengthBars).toBe(4);
  });

  it("can disable each hybrid feature deterministically", () => {
    const options = { features: {
      trackRoleEstimation: false, ornamentSuppression: false, adaptiveSegmentation: false,
      keyPrior: false, twoPassDecoding: false, adjacentMerge: false,
    } };
    const first = timelineFromHybridPipeline(buildHybridPipeline(bytes(), options));
    const second = timelineFromHybridPipeline(buildHybridPipeline(bytes(), options));
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });
});
