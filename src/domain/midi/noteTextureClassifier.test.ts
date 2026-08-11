import { describe, expect, it } from "vitest";
import {
  evaluateP5211NoteRolePredictions,
  generateP5211SyntheticNoteRoleFixtures,
  type P5211NoteRole,
} from "../../../scripts/p5211/noteRoleFixtures";
import {
  decideP5211ShadowPromotion,
  p5211NoteContributionMultipliers,
} from "../../../scripts/p5211/promotionContract";
import {
  classifyNoteTextureFeatureSet,
  p5211NoteTextureClassifierVersion,
  p5211ShadowNoteMultipliers,
} from "./noteTextureClassifier";
import { extractNoteTextureFeatures } from "./noteTextureFeatures";

describe("P5.21.1 Stage02 shadow note classifier", () => {
  it("passes the locked synthetic promotion thresholds without using prediction as truth", () => {
    const fixtures = generateP5211SyntheticNoteRoleFixtures();
    const predictions = predictionsFor(fixtures);
    const metrics = evaluateP5211NoteRolePredictions(fixtures, predictions);
    const official = {
      rootAtOne: 0.581897,
      qualityAtOne: 0.610453,
      exactAtOne: 0.136853,
      boundaryPrecision: 0.765475,
      boundaryRecall: 0.900864,
    };
    const decision = decideP5211ShadowPromotion({
      noteMetrics: metrics,
      deterministic: true,
      officialBaseline: official,
      officialCandidate: official,
      benchmark: { medianRatio: 1, maximumSampleMs: 1, timedOut: false },
      productionOutputsUnchanged: true,
    });

    expect(metrics.evaluatedNotes).toBe(metrics.totalNotes);
    expect(metrics.protectedHarmonicRetention).toBe(1);
    expect(metrics.melodyLikePrecision).toBeGreaterThanOrEqual(0.95);
    expect(metrics.harmonicRetention).toBeGreaterThanOrEqual(0.99);
    expect(metrics.melodyLikeRecall).toBeGreaterThanOrEqual(0.6);
    expect(metrics.uncertainNonSuppression).toBeGreaterThanOrEqual(0.9);
    expect(decision).toEqual({ status: "pass-to-integration", reasons: [] });
  });

  it("never suppresses protected sustained tension, inversion, or long extensions", () => {
    const fixtures = generateP5211SyntheticNoteRoleFixtures();
    const predictions = predictionsFor(fixtures);
    for (const note of fixtures.flatMap((fixture) => [...fixture.notes]).filter((note) => note.protectedHarmonic)) {
      expect(predictions[note.id]).not.toBe("melody-like");
    }
  });

  it("recognizes overlay and monophonic melody positives", () => {
    const predictions = predictionsFor(generateP5211SyntheticNoteRoleFixtures());
    expect(Object.entries(predictions).filter(([id, role]) => id.startsWith("A-") && role === "melody-like"))
      .toHaveLength(4);
    expect(Object.entries(predictions).filter(([id, role]) => id.startsWith("H-") && role === "melody-like"))
      .toHaveLength(8);
  });

  it("keeps arpeggio and broken-chord cases non-suppressed", () => {
    const predictions = predictionsFor(generateP5211SyntheticNoteRoleFixtures());
    for (const [id, role] of Object.entries(predictions)) {
      if (id.startsWith("D-") || id.startsWith("G-")) expect(role).not.toBe("melody-like");
    }
  });

  it("returns deterministic privacy-safe diagnostics and only non-zero multipliers", () => {
    const fixtures = generateP5211SyntheticNoteRoleFixtures();
    const featureSet = extractNoteTextureFeatures(fixtures[0]?.notes.map((note) => ({
      id: note.id,
      pitch: note.pitch,
      startBeat: note.startBeat,
      endBeat: note.startBeat + note.durationBeats,
    })) ?? []);
    const first = classifyNoteTextureFeatureSet(featureSet);
    expect(first).toEqual(classifyNoteTextureFeatureSet(featureSet));
    expect(first.every((entry) => entry.proposedMultiplier > 0)).toBe(true);
    expect(first.every((entry) => entry.evidenceKinds.every((kind) => !kind.includes("chord")))).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/pitch|startBeat|endBeat|label/u);
    expect(p5211NoteTextureClassifierVersion).toBe("p5211-note-texture-shadow-v1");
    expect(new Set(first.map((entry) => entry.proposedMultiplier)).size).toBeGreaterThan(1);
    expect(p5211ShadowNoteMultipliers).toEqual(p5211NoteContributionMultipliers);
    expect(Object.values(p5211NoteContributionMultipliers).every((value) => value > 0)).toBe(true);
  });
});

function predictionsFor(
  fixtures: ReturnType<typeof generateP5211SyntheticNoteRoleFixtures>,
): Record<string, P5211NoteRole> {
  return Object.fromEntries(fixtures.flatMap((fixture) => {
    const features = extractNoteTextureFeatures(fixture.notes.map((note) => ({
      id: note.id,
      pitch: note.pitch,
      startBeat: note.startBeat,
      endBeat: note.startBeat + note.durationBeats,
    })));
    return classifyNoteTextureFeatureSet(features).map((entry) => [entry.noteId, entry.candidateClass]);
  }));
}
