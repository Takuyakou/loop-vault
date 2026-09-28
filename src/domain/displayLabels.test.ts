import { describe, expect, it } from "vitest";
import { candidateLabel, displayKey, statusLabel } from "./displayLabels";

describe("display labels", () => {
  it("uses Japanese status labels without exposing internal values", () => {
    expect(statusLabel("idea")).toBe("Idea");
    expect(statusLabel("arrange")).toBe("展開");
    expect(statusLabel("abandoned")).toBe("没");
  });

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
