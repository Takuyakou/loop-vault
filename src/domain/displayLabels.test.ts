import { describe, expect, it } from "vitest";
import { candidateLabel, displayKey } from "./displayLabels";

describe("display labels", () => {
  it("localizes known candidate labels and preserves unknown labels", () => {
    expect(candidateLabel("turnaround")).toBe("ターンアラウンド");
    expect(candidateLabel("custom")).toBe("custom");
  });

  it("formats common key names for the Japanese UI", () => {
    expect(displayKey("F#")).toBe("F#メジャー");
    expect(displayKey("Fm")).toBe("Fマイナー");
    expect(displayKey("F# major")).toBe("F#メジャー");
  });
});
