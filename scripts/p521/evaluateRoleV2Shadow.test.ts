import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { VoiceRole } from "../../src/domain/midi/types";
import type { RoleV2ShadowInference } from "../../src/domain/midi/voiceRoleV2ShadowClassifier";
import {
  decideP521RoleV2ShadowPromotion,
  evaluateOfficialChordSafetyReport,
  evaluateRoleV2ShadowRegistry,
  lockedP521OfficialChordSafetyBaseline,
  validateStage02OfficialChordSafetyAttestation,
  verifyApprovedRegistryFixtureTruth,
} from "./evaluateRoleV2Shadow";
import { lockedP521OfficialSafetyCorpus } from "./roleV2OfficialSafetyContract";
import {
  anonymousFixtureId,
  type ApprovedFixtureRegistry,
  type RoleBaselineMetrics,
  type SuppliedFixtureDefinition,
} from "./importSuppliedRoleFixturePack";

describe("P5.21 Role v2 shadow evaluation", () => {
  it("compares candidate roles against approved truth without mutating v1 registry rows", () => {
    const registry = fixtureRegistry();
    const candidates = new Map<string, RoleV2ShadowInference>([
      ["fixture-123456781234:0:0", inference("bass")],
      ["fixture-123456781234:1:0", inference("melody")],
      ["fixture-123456781234:2:0", inference("mixed")],
    ]);

    const evaluation = evaluateRoleV2ShadowRegistry(registry, candidates, true, passingOfficialSafety());

    expect(evaluation.v1Metrics).toMatchObject({
      evaluatedVoices: 2,
      ambiguousVoices: 1,
      exactRoleAccuracy: 0.5,
      manualCorrectionCount: 1,
    });
    expect(evaluation.candidateMetrics).toMatchObject({
      exactRoleAccuracy: 1,
      manualCorrectionCount: 0,
      manualCorrectionBurden: 0,
      melodyRecall: 1,
    });
    expect(evaluation.metricDelta).toMatchObject({ exactRoleAccuracy: 0.5, manualCorrectionCount: -1 });
    expect(evaluation.rows).toHaveLength(3);
    expect(evaluation.rows[1]).toMatchObject({ expectedRole: "melody", currentRole: "mixed", candidateRole: "melody" });
    expect(evaluation.officialChordSafety).toMatchObject({ status: "pass", evaluated: true });
    expect(registry.fixtures[0].voices[1].currentAutomaticRole).toBe("mixed");
    expect(evaluation.productionRoleV1Changed).toBe(false);
    expect(evaluation.rawMidiIncluded).toBe(false);
  });

  it("passes only when role metrics and evaluated official chord safety meet their locks", () => {
    const passing = metrics({
      manualCorrectionBurden: 0.16,
      exactRoleAccuracy: 0.84,
      melodyRecall: 0.8,
      harmonyPrecision: 1,
      bassPrecision: 1,
      percussionPrecision: 1,
    });
    expect(decideP521RoleV2ShadowPromotion(passing, true, passingOfficialSafety())).toMatchObject({
      status: "pass-to-stage03",
      roleMetricGatePassed: true,
      officialChordSafetyGatePassed: true,
    });
  });

  it("fails-stop when official safety is missing or a locked chord metric regresses", () => {
    const passing = metrics({
      manualCorrectionBurden: 0.16,
      exactRoleAccuracy: 0.84,
      melodyRecall: 0.8,
    });
    const missing = evaluateOfficialChordSafetyReport({ results: [] });
    const missingDecision = decideP521RoleV2ShadowPromotion(passing, true, missing);
    expect(missing).toMatchObject({ status: "missing", evaluated: false });
    expect(missingDecision).toMatchObject({ status: "fail-stop-promotion", officialChordSafetyGatePassed: false });
    expect(missingDecision.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/official chord safety/)]));

    const regressed = evaluateOfficialChordSafetyReport(officialReport({ rootAt1: 0.5 }));
    const regressedDecision = decideP521RoleV2ShadowPromotion(passing, true, regressed);
    expect(regressed).toMatchObject({ status: "fail", evaluated: true });
    expect(regressedDecision).toMatchObject({ status: "fail-stop-promotion", officialChordSafetyGatePassed: false });
    expect(regressedDecision.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/Root@1/)]));
  });

  it("fails-stop when an evaluated official report omits a locked metric", () => {
    const incomplete = officialReport();
    delete (incomplete.results[0].metrics as { boundaryRecall?: number }).boundaryRecall;
    const safety = evaluateOfficialChordSafetyReport(incomplete);

    expect(safety).toMatchObject({ status: "missing", evaluated: false, metrics: null });
    expect(decideP521RoleV2ShadowPromotion(metrics({ manualCorrectionBurden: 0.16 }), true, safety))
      .toMatchObject({ status: "fail-stop-promotion" });
  });

  it("accepts only a current full-clean Stage 02 report linked to its attestation", () => {
    const report = stage02Report();
    const bytes = Buffer.from(JSON.stringify(report));
    const currentCommit = "a".repeat(40);
    const safety = validateStage02OfficialChordSafetyAttestation(bytes, stage02Attestation(bytes, currentCommit), currentCommit);

    expect(safety).toMatchObject({ status: "pass", evaluated: true, deterministic: true });
  });

  it("rejects stale, baseline-kind, partial-clean, wrong-mode, and wrong-corpus attestations", () => {
    const currentCommit = "a".repeat(40);
    const report = stage02Report();
    const bytes = Buffer.from(JSON.stringify(report));

    expect(validateStage02OfficialChordSafetyAttestation(bytes, stage02Attestation(bytes, "b".repeat(40)), currentCommit))
      .toMatchObject({ status: "fail", evaluated: false, reasons: [expect.stringMatching(/stale/)] });

    const baseline = stage02Attestation(bytes, currentCommit) as Record<string, unknown>;
    baseline.kind = "p521-stage00-official-chord-safety-attestation";
    expect(validateStage02OfficialChordSafetyAttestation(bytes, baseline, currentCommit))
      .toMatchObject({ status: "fail", evaluated: false });

    const partial = stage02Report();
    partial.evaluatedCaseLimitPerCategory = 20;
    partial.results[0].caseCount = 20;
    const partialBytes = Buffer.from(JSON.stringify(partial));
    expect(validateStage02OfficialChordSafetyAttestation(partialBytes, stage02Attestation(partialBytes, currentCommit), currentCommit))
      .toMatchObject({ status: "fail", evaluated: false, reasons: [expect.stringMatching(/full clean/)] });

    const wrongMode = stage02Report();
    wrongMode.results[0].mode = "legacy";
    const wrongModeBytes = Buffer.from(JSON.stringify(wrongMode));
    expect(validateStage02OfficialChordSafetyAttestation(wrongModeBytes, stage02Attestation(wrongModeBytes, currentCommit), currentCommit))
      .toMatchObject({ status: "fail", evaluated: false, reasons: [expect.stringMatching(/expected-mode/)] });

    const wrongCorpus = stage02Attestation(bytes, currentCommit) as { cleanManifest: { fileCount: number } };
    wrongCorpus.cleanManifest.fileCount = 99;
    expect(validateStage02OfficialChordSafetyAttestation(bytes, wrongCorpus, currentCommit))
      .toMatchObject({ status: "fail", evaluated: false, reasons: [expect.stringMatching(/required full corpus/)] });

    const sameCountDifferentHash = stage02Attestation(bytes, currentCommit) as { cleanManifest: { identity: string } };
    sameCountDifferentHash.cleanManifest.identity = `sha256:${"e".repeat(64)}`;
    expect(validateStage02OfficialChordSafetyAttestation(bytes, sameCountDifferentHash, currentCommit))
      .toMatchObject({ status: "fail", evaluated: false, reasons: [expect.stringMatching(/required full corpus/)] });

    const partialDirty = stage02Report();
    partialDirty.results[1].caseCount = 1099;
    const partialDirtyBytes = Buffer.from(JSON.stringify(partialDirty));
    expect(validateStage02OfficialChordSafetyAttestation(partialDirtyBytes, stage02Attestation(partialDirtyBytes, currentCommit), currentCommit))
      .toMatchObject({ status: "fail", evaluated: false, reasons: [expect.stringMatching(/full clean/)] });

    const mismatchedMetrics = stage02Attestation(bytes, currentCommit) as { official: { metrics: { rootAt1: number } } };
    mismatchedMetrics.official.metrics.rootAt1 = 0;
    expect(validateStage02OfficialChordSafetyAttestation(bytes, mismatchedMetrics, currentCommit))
      .toMatchObject({ status: "fail", evaluated: false, reasons: [expect.stringMatching(/metrics or determinism/)] });
  });
  it("rejects a registry whose expected roles differ from the supplied anonymous fixture contract", () => {
    const registry = fixtureRegistryWithAnonymousId();
    const fixture = suppliedFixture("bass");
    expect(() => verifyApprovedRegistryFixtureTruth(registry, [fixture])).not.toThrow();
    expect(() => verifyApprovedRegistryFixtureTruth(registry, [suppliedFixture("melody")]))
      .toThrow("approved fixture registry does not match the supplied synthetic pack");
  });
});

function stage02Report() {
  return {
    sourceCaseCount: 100,
    evaluatedCaseLimitPerCategory: null,
    results: [{
      category: "clean",
      mode: "voice-aware-rerank-v1",
      caseCount: lockedP521OfficialSafetyCorpus.clean.caseCount,
      metrics: { ...lockedP521OfficialChordSafetyBaseline },
    }, {
      category: "drums",
      mode: "voice-aware-rerank-v1",
      caseCount: lockedP521OfficialSafetyCorpus.dirty.caseCount,
      metrics: {},
    }],
    determinism: { passed: true },
  };
}

function stage02Attestation(reportBytes: Uint8Array, candidateCommit: string) {
  return {
    schemaVersion: 1,
    kind: "p521-stage02-official-chord-safety-attestation",
    codeCandidateCommit: candidateCommit,
    codeCandidatePolicy: "same-commit-or-docs-only-descendant",
    classifierVersion: "p521-role-v2-shadow-v1",
    corpusContract: "p521-stage02-registered-worktree-phase365-full-clean",
    cleanManifest: { identity: lockedP521OfficialSafetyCorpus.clean.identity, fileCount: lockedP521OfficialSafetyCorpus.clean.caseCount },
    dirtyManifest: { identity: lockedP521OfficialSafetyCorpus.dirty.identity, fileCount: lockedP521OfficialSafetyCorpus.dirty.caseCount },
    report: {
      kind: "p521-stage02-official-chord-safety-report",
      sha256: createHash("sha256").update(reportBytes).digest("hex"),
      expectedMode: "voice-aware-rerank-v1",
      fullCleanCaseCount: lockedP521OfficialSafetyCorpus.clean.caseCount,
      fullDirtyCaseCount: lockedP521OfficialSafetyCorpus.dirty.caseCount,
    },
    official: {
      deterministic: true,
      metrics: {
        rootAt1: lockedP521OfficialChordSafetyBaseline.rootAt1,
        qualityAt1: lockedP521OfficialChordSafetyBaseline.qualityAt1,
        exactAt1: lockedP521OfficialChordSafetyBaseline.exactAt1,
        boundaryPrecision: lockedP521OfficialChordSafetyBaseline.boundaryPrecision,
        boundaryRecall: lockedP521OfficialChordSafetyBaseline.boundaryRecall,
      },
    },
  };
}
function fixtureRegistry(): ApprovedFixtureRegistry {
  return registryWithId("fixture-123456781234");
}

function fixtureRegistryWithAnonymousId(): ApprovedFixtureRegistry {
  return registryWithId(anonymousFixtureId("synthetic-fixture"));
}

function registryWithId(id: string): ApprovedFixtureRegistry {
  return {
    schemaVersion: 1,
    kind: "p521-approved-synthetic-role-fixture-registry",
    provenance: {
      fixturePack: "p5.21-supplied-synthetic",
      expectedRoles: "fixture-defined-ground-truth",
      currentPredictionIsNotTruth: true,
      sourcePathsIncluded: false,
      rawMidiIncluded: false,
    },
    fixtures: [{
      schemaVersion: 1,
      kind: "p521-role-ground-truth-template",
      fixture: { id, sourceIdentity: "local-midi-not-recorded" },
      expectedRoleOptions: ["bass", "harmony", "pad", "melody", "percussion", "mixed", "ambiguous"],
      reviewPolicy: [],
      voices: [
        voice(id, 0, "bass", "bass"),
        voice(id, 1, "melody", "mixed"),
        voice(id, 2, "ambiguous", "mixed"),
      ],
    }],
  };
}

function suppliedFixture(firstExpectedRole: "bass" | "melody"): SuppliedFixtureDefinition {
  return {
    fixtureId: "synthetic-fixture",
    file: "fixture.mid",
    groundTruth: [
      { voiceKey: "voice:0/ch:0", expectedRole: firstExpectedRole },
      { voiceKey: "voice:1/ch:0", expectedRole: "melody" },
      { voiceKey: "voice:2/ch:0", expectedRole: "ambiguous" },
    ],
  };
}

function voice(fixtureId: string, index: number, expectedRole: "bass" | "melody" | "ambiguous", currentAutomaticRole: VoiceRole) {
  return {
    voiceId: `${fixtureId}:${index}:0`,
    voiceIndex: index + 1,
    trackIndex: index,
    channelIndex: 0,
    midiChannel: 1,
    safeVoiceLabel: "MIDI Channel 1",
    dominantProgram: null,
    gmProgramName: null,
    programNumbers: [],
    hasProgramChanges: false,
    isDrum: false,
    noteCount: 4,
    pitchRange: { min: 48, max: 60 },
    averageDurationBeats: 1,
    averagePolyphony: 1,
    currentAutomaticRole,
    currentAutomaticRoleConfidence: 0.4,
    evidence: [{ kind: "measured" as const, role: currentAutomaticRole, confidence: 0.4 }],
    suggestedExpectedRole: currentAutomaticRole,
    expectedRole,
    humanReviewNote: "fixture-defined synthetic ground truth",
  };
}

function inference(role: VoiceRole): RoleV2ShadowInference {
  return { role, confidenceBucket: "medium", evidenceKinds: ["time-weighted-monophony"] };
}

function passingOfficialSafety() {
  return evaluateOfficialChordSafetyReport(officialReport());
}

function officialReport(overrides: Partial<{ rootAt1: number; qualityAt1: number; exactAt1: number; boundaryPrecision: number; boundaryRecall: number }> = {}) {
  return {
    results: [{
      category: "clean",
      mode: "voice-aware-rerank-v1",
      caseCount: 100,
      metrics: { ...lockedP521OfficialChordSafetyBaseline, ...overrides },
    }],
    determinism: { passed: true },
  };
}

function metrics(overrides: Partial<RoleBaselineMetrics>): RoleBaselineMetrics {
  return {
    totalVoices: 25,
    evaluatedVoices: 25,
    ambiguousVoices: 1,
    exactRoleAccuracy: 0.8,
    manualCorrectionCount: 5,
    manualCorrectionBurden: 0.2,
    mixedPredictionRate: 0.12,
    melodyRecall: 0.6,
    harmonyPrecision: 1,
    bassPrecision: 1,
    percussionPrecision: 1,
    confusionMatrix: {
      bass: roles(), harmony: roles(), pad: roles(), melody: roles(), percussion: roles(), mixed: roles(), ambiguous: roles(),
    },
    ...overrides,
  };
}

function roles(): Record<VoiceRole, number> {
  return { bass: 0, harmony: 0, pad: 0, melody: 0, percussion: 0, mixed: 0 };
}