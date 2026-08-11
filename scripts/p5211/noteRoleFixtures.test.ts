import { describe, expect, it } from "vitest";
import {
  evaluateP5211NoteRolePredictions,
  generateP5211DenseBenchmarkFixture,
  generateP5211SyntheticNoteRoleFixtures,
  type P5211NoteRole,
} from "./noteRoleFixtures";
import {
  decideP5211ShadowPromotion,
  p5211EligibleVoiceRoles,
  p5211NoteContributionMultipliers,
  p5211PromotionThresholds,
} from "./promotionContract";

describe("P5.21.1 Stage00 synthetic note-role fixtures", () => {
  it("generates the locked A-J fixture catalog deterministically", () => {
    const first = generateP5211SyntheticNoteRoleFixtures();
    const second = generateP5211SyntheticNoteRoleFixtures();

    expect(first).toEqual(second);
    expect(first.map((fixture) => fixture.id)).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]);
    const ids = first.flatMap((fixture) => fixture.notes.map((note) => note.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("locks tension, inversion, and long-extension notes as protected harmony", () => {
    const fixtures = generateP5211SyntheticNoteRoleFixtures();
    const protectedByFixture = new Map(fixtures.map((fixture) => [
      fixture.id,
      fixture.notes.filter((note) => note.protectedHarmonic),
    ]));

    expect(protectedByFixture.get("B")).not.toHaveLength(0);
    expect(protectedByFixture.get("C")).not.toHaveLength(0);
    expect(protectedByFixture.get("J")).not.toHaveLength(0);
    expect([...protectedByFixture.values()].flat().every((note) => note.expectedRole === "harmonic")).toBe(true);
  });

  it("contains melody-positive, harmonic-negative, and conservative uncertain labels", () => {
    const roles = generateP5211SyntheticNoteRoleFixtures()
      .flatMap((fixture) => fixture.notes.map((note) => note.expectedRole));
    expect(new Set(roles)).toEqual(new Set<P5211NoteRole>(["harmonic", "melody-like", "uncertain"]));
  });

  it("generates a bounded deterministic dense benchmark fixture", () => {
    expect(generateP5211DenseBenchmarkFixture(2)).toEqual(generateP5211DenseBenchmarkFixture(2));
    expect(generateP5211DenseBenchmarkFixture(2).length).toBeGreaterThan(20);
    expect(() => generateP5211DenseBenchmarkFixture(0)).toThrow("repetitions");
    expect(() => generateP5211DenseBenchmarkFixture(257)).toThrow("repetitions");
  });

  it("computes the locked note-role metrics without adopting a classifier prediction as truth", () => {
    const fixtures = generateP5211SyntheticNoteRoleFixtures();
    const predictions = Object.fromEntries(fixtures.flatMap((fixture) => fixture.notes.map((note) => [
      note.id,
      note.expectedRole,
    ]))) as Record<string, P5211NoteRole>;
    const metrics = evaluateP5211NoteRolePredictions(fixtures, predictions);

    expect(metrics.evaluatedNotes).toBe(metrics.totalNotes);
    expect(metrics.exactAccuracy).toBe(1);
    expect(metrics.melodyLikePrecision).toBe(1);
    expect(metrics.melodyLikeRecall).toBe(1);
    expect(metrics.harmonicRetention).toBe(1);
    expect(metrics.protectedHarmonicRetention).toBe(1);
    expect(metrics.uncertainNonSuppression).toBe(1);
  });
});

describe("P5.21.1 Stage00 promotion contract", () => {
  it("locks conservative eligibility, non-zero multipliers, and thresholds", () => {
    expect(p5211EligibleVoiceRoles).toEqual(["harmony", "pad", "mixed"]);
    expect(p5211NoteContributionMultipliers).toEqual({
      harmonic: 1,
      uncertain: 0.9,
      "melody-like": 0.25,
    });
    expect(Math.min(...Object.values(p5211NoteContributionMultipliers))).toBeGreaterThan(0);
    expect(p5211PromotionThresholds.protectedHarmonicRetention).toBe(1);
    expect(p5211PromotionThresholds.maximumOfficialExactAtOneDecline).toBe(0.0025);
  });

  it("passes only a complete, deterministic result within all locked safety budgets", () => {
    const fixtures = generateP5211SyntheticNoteRoleFixtures();
    const predictions = Object.fromEntries(fixtures.flatMap((fixture) => fixture.notes.map((note) => [
      note.id,
      note.expectedRole,
    ]))) as Record<string, P5211NoteRole>;
    const noteMetrics = evaluateP5211NoteRolePredictions(fixtures, predictions);
    const official = {
      rootAtOne: 0.58,
      qualityAtOne: 0.61,
      exactAtOne: 0.14,
      boundaryPrecision: 0.76,
      boundaryRecall: 0.9,
    };

    expect(decideP5211ShadowPromotion({
      noteMetrics,
      deterministic: true,
      officialBaseline: official,
      officialCandidate: { ...official, exactAtOne: official.exactAtOne - 0.0025 },
      benchmark: { medianRatio: 2, maximumSampleMs: 2_000, timedOut: false },
      productionOutputsUnchanged: true,
    })).toEqual({ status: "pass-to-integration", reasons: [] });
  });

  it("fails closed when one protected harmonic note is classified melody-like", () => {
    const fixtures = generateP5211SyntheticNoteRoleFixtures();
    const predictions = Object.fromEntries(fixtures.flatMap((fixture) => fixture.notes.map((note) => [
      note.id,
      note.expectedRole,
    ]))) as Record<string, P5211NoteRole>;
    const protectedNote = fixtures.flatMap((fixture) => [...fixture.notes])
      .find((note) => note.protectedHarmonic);
    if (!protectedNote) throw new Error("protected fixture missing");
    predictions[protectedNote.id] = "melody-like";
    const noteMetrics = evaluateP5211NoteRolePredictions(fixtures, predictions);
    const official = {
      rootAtOne: 1,
      qualityAtOne: 1,
      exactAtOne: 1,
      boundaryPrecision: 1,
      boundaryRecall: 1,
    };

    const decision = decideP5211ShadowPromotion({
      noteMetrics,
      deterministic: true,
      officialBaseline: official,
      officialCandidate: official,
      benchmark: { medianRatio: 1, maximumSampleMs: 1, timedOut: false },
      productionOutputsUnchanged: true,
    });
    expect(decision.status).toBe("fail-stop-promotion");
    expect(decision.reasons).toContain("protected harmonic retention regressed");
  });
});
