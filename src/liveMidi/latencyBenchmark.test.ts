import { describe, expect, it } from "vitest";
import { benchmarkLiveMidiLatency } from "./latencyBenchmark";

describe("benchmarkLiveMidiLatency", () => {
  it("shows the deadline scheduler improvement without inventing physical-device timing", () => {
    const result = benchmarkLiveMidiLatency(2);

    expect(result.before.confirmedChord).toEqual({ p50Ms: 141, p90Ms: 157 });
    expect(result.after.notesAndBass).toEqual({ p50Ms: 2, p90Ms: 2 });
    expect(result.after.blockChordProvisional).toEqual({ p50Ms: 27, p90Ms: 39 });
    expect(result.after.confirmedChord).toEqual({ p50Ms: 52, p90Ms: 52 });
    expect(result.after.arpeggioFromLastNote).toEqual({ p50Ms: 52, p90Ms: 52 });
    expect(result.after.fullRelease).toEqual({ p50Ms: 182, p90Ms: 182 });
  });

  it("is deterministic", () => {
    expect(benchmarkLiveMidiLatency()).toEqual(benchmarkLiveMidiLatency());
  });
});
