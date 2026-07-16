import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../../chords";
import type { ChordTimelineItem } from "../../types";
import type { RealMidiEvaluationCase } from "./types";
import { evaluateBronzeCases, evaluateGoldCases, evaluateSilverCases } from "./realMetrics";

const timeline = (label: string, confidence = 0.9): ChordTimelineItem[] => [{
  bar: 1, beat: 1, durationBeats: 4, chord: parseChordLabel(label)!, confidence, alternatives: [], warnings: [],
}];
const definition = (strength: "gold" | "silver" | "bronze"): RealMidiEvaluationCase => ({
  schemaVersion: 1,
  id: strength,
  source: { fingerprint: `sha256-${"a".repeat(64)}` },
  range: { startBeat: 0, endBeat: 4 },
  expected: {
    primary: [{ startBeat: 0, endBeat: 4, primary: "Cmaj7", root: 0, quality: "maj7" }],
    alternatives: [{
      startBeat: 0, endBeat: 4,
      alternatives: [{ chord: "Cmaj9", strength: "strong", reason: "manual" }],
    }],
  },
  label: { strength, origin: "manual-import" },
});

describe("real MIDI metrics", () => {
  it("keeps exact and acceptable Gold metrics separate", () => {
    const analyzed = [{ definition: definition("gold"), legacy: timeline("Cmaj7"), reranker: timeline("Cmaj9") }];
    expect(evaluateGoldCases(analyzed, "legacy").exactAccuracy).toBe(1);
    const reranker = evaluateGoldCases(analyzed, "reranker");
    expect(reranker.exactAccuracy).toBe(0);
    expect(reranker.strongAlternativeAccuracy).toBe(1);
  });

  it("reports Silver improvements and regressions without calling them accuracy", () => {
    const analyzed = [{ definition: definition("silver"), legacy: timeline("Dm"), reranker: timeline("Cmaj7") }];
    const metrics = evaluateSilverCases(analyzed);
    expect(metrics.improvementCount).toBe(1);
    expect(metrics.regressionCount).toBe(0);
  });

  it("uses Bronze only for agreement, confidence and review demand", () => {
    const analyzed = [{ definition: definition("bronze"), legacy: timeline("Cmaj7"), reranker: timeline("Dm", 0.4) }];
    const metrics = evaluateBronzeCases(analyzed);
    expect(metrics.analyzerAgreement).toBe(0);
    expect(metrics.confidenceDistribution.review).toBe(1);
    expect(metrics.reviewCandidateCount).toBe(1);
    expect(metrics).not.toHaveProperty("exactAccuracy");
  });
});
