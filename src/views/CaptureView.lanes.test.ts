import { describe, expect, it } from "vitest";
import { candidateLanes } from "./CaptureView";
import type { ProgressionBlockCandidate } from "../domain/types";

/**
 * Lane placement.
 *
 * A vamp keeps its own lane rather than being hidden or scored down, and a
 * fragment never sits in the main lane while anything better exists. Both rules
 * come from Phase 4.0: a one-chord loop is a musical shape, not a defect.
 */
function candidate(
  id: string,
  kind: ProgressionBlockCandidate["kind"],
): ProgressionBlockCandidate {
  return {
    id,
    startBar: 1,
    endBar: 8,
    lengthBars: 8,
    chords: [],
    summaryText: id,
    confidence: 0.9,
    labels: [],
    warnings: [],
    ...(kind ? { kind } : {}),
  };
}

describe("candidate lanes", () => {
  it("orders progressions, then vamps, then fragments", () => {
    const lanes = candidateLanes([
      candidate("f1", "fragment"),
      candidate("v1", "vamp"),
      candidate("p1", "progression"),
    ]);

    expect(lanes.map((lane) => lane.kind)).toEqual(["progression", "vamp", "fragment"]);
  });

  it("keeps vamps rather than dropping them", () => {
    const lanes = candidateLanes([candidate("p1", "progression"), candidate("v1", "vamp")]);
    const vampLane = lanes.find((lane) => lane.kind === "vamp");

    expect(vampLane?.candidates.map((entry) => entry.candidate.id)).toEqual(["v1"]);
  });

  it("omits a lane that has nothing in it", () => {
    const lanes = candidateLanes([candidate("p1", "progression"), candidate("p2", "progression")]);

    expect(lanes.map((lane) => lane.kind)).toEqual(["progression"]);
  });

  it("drops the headings when only one lane is populated", () => {
    // A song made entirely of vamps reads as a list of candidates, not as a list
    // under a notice about what it failed to be.
    const lanes = candidateLanes([candidate("v1", "vamp"), candidate("v2", "vamp")]);

    expect(lanes).toHaveLength(1);
    expect(lanes[0].heading).toBeNull();
  });

  it("keeps the original card numbering across lanes", () => {
    const lanes = candidateLanes([
      candidate("p1", "progression"),
      candidate("v1", "vamp"),
      candidate("p2", "progression"),
    ]);

    expect(lanes[0].candidates.map((entry) => entry.index)).toEqual([0, 2]);
    expect(lanes[1].candidates.map((entry) => entry.index)).toEqual([1]);
  });

  it("leaves candidates from an analyzer without classification in the main lane", () => {
    const lanes = candidateLanes([candidate("legacy", undefined)]);

    expect(lanes).toHaveLength(1);
    expect(lanes[0].kind).toBe("progression");
  });
});
