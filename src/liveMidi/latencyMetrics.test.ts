import { describe, expect, it } from "vitest";
import { LiveMidiLatencyTracker } from "./latencyMetrics";

describe("LiveMidiLatencyTracker", () => {
  it("reports deterministic p50 and p90 values", () => {
    const tracker = new LiveMidiLatencyTracker();
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach((value) => {
      tracker.record("frontendBatchReceived", value);
    });

    expect(tracker.report().frontendBatchReceived).toEqual({
      count: 10,
      p50Ms: 5,
      p90Ms: 9,
    });
  });

  it("ignores invalid samples and keeps stage reports available", () => {
    const tracker = new LiveMidiLatencyTracker();
    tracker.record("noteStateUpdated", Number.NaN);

    expect(tracker.report().noteStateUpdated).toEqual({ count: 0 });
    expect(tracker.report().confirmedChordDisplayed).toEqual({ count: 0 });
  });

  it("keeps only the latest 256 samples per stage", () => {
    const tracker = new LiveMidiLatencyTracker();
    for (let value = 0; value < 300; value += 1) {
      tracker.record("noteStateUpdated", value);
    }

    expect(tracker.report().noteStateUpdated.count).toBe(256);
  });
});
