import { describe, expect, it } from "vitest";
import { candidateLabel, displayKey, statusLabel } from "./displayLabels";

describe("display labels", () => {
  it("uses Japanese status labels without exposing internal values", () => {
    expect(statusLabel("arrange", "ja")).toBe("展開");
    expect(statusLabel("abandoned", "ja")).toBe("没");
  });

  it("localizes known candidate labels and preserves unknown labels", () => {
    expect(candidateLabel("turnaround", "ja")).toBe("ターンアラウンド");
    expect(candidateLabel("custom", "ja")).toBe("custom");
  });

  it("formats common key names for the Japanese UI", () => {
    expect(displayKey("F#", "ja")).toBe("F#メジャー");
    expect(displayKey("Fm", "ja")).toBe("Fマイナー");
    expect(displayKey("F# major", "ja")).toBe("F#メジャー");
  });
});
