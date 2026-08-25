import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { roleV2ShadowClassifierVersion } from "../../src/domain/midi/voiceRoleV2ShadowClassifier";
import { lockedP521OfficialSafetyCorpus } from "../p521/roleV2OfficialSafetyContract";
import {
  validateP524FreshOfficialEvidence,
  type P524FreshOfficialValidationInput,
  type P524OfficialFreshnessEnvelope,
} from "./officialEvidence";
import { p524OfficialBaseline } from "./promotionContract";

const currentCommit = "a".repeat(40);
const nonce = "11111111-1111-4111-8111-111111111111";
const candidateContentSha256 = "c".repeat(64);

function fixture(): P524FreshOfficialValidationInput {
  const metrics = { ...p524OfficialBaseline };
  const report = {
    sourceCaseCount: 100,
    evaluatedCaseLimitPerCategory: null,
    results: [
      { category: "clean", mode: "voice-aware-rerank-v1", caseCount: 100, metrics },
      { category: "dirty", mode: "voice-aware-rerank-v1", caseCount: 1100, metrics },
    ],
    determinism: { passed: true },
  };
  const reportBytes = Buffer.from(JSON.stringify(report));
  const attestation = {
    schemaVersion: 1,
    kind: "p521-stage02-official-chord-safety-attestation",
    codeCandidateCommit: currentCommit,
    codeCandidatePolicy: lockedP521OfficialSafetyCorpus.codeCandidatePolicy,
    classifierVersion: roleV2ShadowClassifierVersion,
    corpusContract: "p521-stage02-registered-worktree-phase365-full-clean",
    cleanManifest: {
      identity: lockedP521OfficialSafetyCorpus.clean.identity,
      fileCount: lockedP521OfficialSafetyCorpus.clean.caseCount,
    },
    dirtyManifest: {
      identity: lockedP521OfficialSafetyCorpus.dirty.identity,
      fileCount: lockedP521OfficialSafetyCorpus.dirty.caseCount,
    },
    report: {
      kind: "p521-stage02-official-chord-safety-report",
      sha256: sha256(reportBytes),
      expectedMode: lockedP521OfficialSafetyCorpus.expectedMode,
      fullCleanCaseCount: 100,
      fullDirtyCaseCount: 1100,
    },
    official: { deterministic: true, metrics },
  };
  const attestationBytes = Buffer.from(JSON.stringify(attestation));
  const envelope: P524OfficialFreshnessEnvelope = {
    schemaVersion: 1,
    kind: "p524-stage02-official-freshness",
    promotionRunNonce: nonce,
    startedAtMs: 1_000,
    completedAtMs: 2_000,
    codeCandidateCommit: currentCommit,
    observedAfterWriteAtMs: 2_100,
    candidateContentSha256,
    candidatePathCount: 14,
    reportSha256: sha256(reportBytes),
    attestationSha256: sha256(attestationBytes),
    cleanCaseCount: 100,
    dirtyCaseCount: 1100,
  };
  return {
    reportBytes,
    attestationBytes,
    envelope,
    expectedNonce: nonce,
    currentCommit,
    reportMtimeMs: 1_500,
    attestationMtimeMs: 1_600,
    envelopeMtimeMs: 2_000,
    validationNowMs: 2_500,
    candidateContentSha256,
  };
}

describe("P5.24-02 fresh official evidence binding", () => {
  it("accepts a same-run nonce, current HEAD, full corpus, hash-linked pair", () => {
    expect(validateP524FreshOfficialEvidence(fixture())).toMatchObject({
      status: "pass",
      deterministic: true,
      codeCandidateCommit: currentCommit,
    });
  });

  it("rejects stale or copied files by mtime and process nonce", () => {
    const valid = fixture();
    expect(validateP524FreshOfficialEvidence({ ...valid, reportMtimeMs: -1 })).toMatchObject({ status: "fail" });
    expect(validateP524FreshOfficialEvidence({
      ...valid,
      expectedNonce: "22222222-2222-4222-8222-222222222222",
    })).toMatchObject({ status: "fail" });
  });

  it("rejects mismatched HEAD and copied report/attestation hashes", () => {
    const valid = fixture();
    expect(validateP524FreshOfficialEvidence({ ...valid, currentCommit: "b".repeat(40) }))
      .toMatchObject({ status: "fail" });
    expect(validateP524FreshOfficialEvidence({
      ...valid,
      reportBytes: Buffer.from("copied baseline metrics are not a report"),
    })).toMatchObject({ status: "fail" });
    expect(validateP524FreshOfficialEvidence({
      ...valid, candidateContentSha256: "d".repeat(64),
    })).toMatchObject({ status: "fail" });
  });

  it("rejects baseline/self-substitution and non-Stage02 attestation kinds", () => {
    const valid = fixture();
    const parsed = JSON.parse(Buffer.from(valid.attestationBytes).toString("utf8")) as Record<string, unknown>;
    const baselineAttestation = {
      ...parsed,
      kind: "p521-stage00-official-chord-safety-attestation",
    };
    const baselineBytes = Buffer.from(JSON.stringify(baselineAttestation));
    const envelope = {
      ...(valid.envelope as P524OfficialFreshnessEnvelope),
      attestationSha256: sha256(baselineBytes),
    };
    expect(validateP524FreshOfficialEvidence({
      ...valid,
      attestationBytes: baselineBytes,
      envelope,
    })).toMatchObject({ status: "fail" });
  });

  it("rejects a hash-consistent report whose official metrics miss the locked baseline", () => {
    const valid = fixture();
    const report = JSON.parse(Buffer.from(valid.reportBytes).toString("utf8")) as {
      results: Array<{ metrics: Record<string, number> }>;
    };
    report.results[0]!.metrics.rootAt1 = p524OfficialBaseline.rootAt1 - 0.01;
    const reportBytes = Buffer.from(JSON.stringify(report));
    const attestation = JSON.parse(Buffer.from(valid.attestationBytes).toString("utf8")) as {
      report: { sha256: string };
      official: { metrics: Record<string, number> };
    };
    attestation.report.sha256 = sha256(reportBytes);
    attestation.official.metrics = report.results[0]!.metrics;
    const attestationBytes = Buffer.from(JSON.stringify(attestation));
    const envelope = {
      ...(valid.envelope as P524OfficialFreshnessEnvelope),
      reportSha256: sha256(reportBytes),
      attestationSha256: sha256(attestationBytes),
    };
    expect(validateP524FreshOfficialEvidence({ ...valid, reportBytes, attestationBytes, envelope }))
      .toMatchObject({ status: "fail" });
  });

  it("accepts real filesystem writes observed after a fractional mtime", async () => {
    const directory = await mkdtemp(join(tmpdir(), "p524-freshness-"));
    try {
      const valid = fixture();
      const reportPath = join(directory, "report.json");
      const attestationPath = join(directory, "attestation.json");
      const envelopePath = join(directory, "freshness.json");
      await writeFile(reportPath, valid.reportBytes);
      await writeFile(attestationPath, valid.attestationBytes);
      const [reportStats, attestationStats] = await Promise.all([
        stat(reportPath), stat(attestationPath),
      ]);
      const completedAtMs = Math.floor(Math.min(reportStats.mtimeMs, attestationStats.mtimeMs));
      const observedAfterWriteAtMs = Math.max(Date.now(), reportStats.mtimeMs, attestationStats.mtimeMs);
      const envelope = {
        ...(valid.envelope as P524OfficialFreshnessEnvelope),
        startedAtMs: completedAtMs - 1_000,
        completedAtMs,
        observedAfterWriteAtMs,
      };
      await writeFile(envelopePath, JSON.stringify(envelope));
      const [reportBytes, attestationBytes, envelopeStats] = await Promise.all([
        readFile(reportPath),
        readFile(attestationPath),
        stat(envelopePath),
      ]);
      expect(validateP524FreshOfficialEvidence({
        ...valid,
        reportBytes,
        attestationBytes,
        envelope,
        reportMtimeMs: reportStats.mtimeMs,
        attestationMtimeMs: attestationStats.mtimeMs,
        envelopeMtimeMs: envelopeStats.mtimeMs,
        validationNowMs: Math.max(Date.now(), envelopeStats.mtimeMs),
      })).toMatchObject({ status: "pass" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
