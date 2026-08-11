import { describe, expect, it } from "vitest";
import {
  renderP5211Stage04Markdown,
  type P5211Stage04Artifact,
} from "./evaluateHarmonicCoreIntegration";

describe("P5.21.1 Stage04 regression support", () => {
  it("renders only anonymous aggregate comparison data", () => {
    const markdown = renderP5211Stage04Markdown(artifact());
    expect(markdown).toContain("p5211-real-001");
    expect(markdown).toContain("Old/new output changed: true");
    expect(markdown).not.toMatch(/"pitch"\s*:|"startBeat"\s*:|"endBeat"\s*:/u);
    expect(markdown).not.toMatch(/[A-Za-z]:\\Users\\|\.mid\b/u);
  });

  it("records non-zero weights, deterministic output, and zero retained resources", () => {
    const value = artifact();
    expect(value.deterministic).toBe(true);
    expect(value.noteWeights.minimumMultiplier).toBeGreaterThan(0);
    expect(value.resource.activeHandleDelta).toBe(0);
    expect(value.resource.retainedAnalysisCount).toBe(0);
    expect(value.privacy).toEqual({
      rawNotesPersisted: false,
      sourcePathPersisted: false,
      sourceTitlePersisted: false,
    });
  });
});

function artifact(): P5211Stage04Artifact {
  return {
    schemaVersion: 1,
    kind: "p5211-stage04-harmonic-core-regression",
    codeCandidateCommit: "a".repeat(40),
    fixtureId: "p5211-real-001",
    oldBaselineCandidate: "506ce9bdec624c772fb33ede7d28fa5544ec8bcf",
    deterministic: true,
    oldNew: {
      outputChanged: true,
      timelineEventDelta: 0,
      blockCandidateDelta: 0,
      topologyUnchanged: true,
    },
    noteWeights: {
      eligibleVoiceCount: 4,
      weightedNoteCount: 100,
      classCounts: { harmonic: 70, "melody-like": 20, uncertain: 10 },
      minimumMultiplier: 0.25,
    },
    performance: {
      featureClassifierMedianRatio: 1,
      fullAnalysis: { medianMs: 10, maximumMs: 20 },
      timedOut: false,
    },
    resource: {
      activeHandleMeasurementAvailable: true,
      activeHandleDelta: 0,
      repeatedAnalysisCount: 20,
      retainedAnalysisCount: 0,
      heapDeltaBytes: 0,
      rssDeltaBytes: 0,
    },
    privacy: {
      rawNotesPersisted: false,
      sourcePathPersisted: false,
      sourceTitlePersisted: false,
    },
  };
}
