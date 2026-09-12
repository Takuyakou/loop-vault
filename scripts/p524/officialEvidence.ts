import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  validateStage02OfficialChordSafetyAttestation,
  type OfficialChordSafetyMetrics,
} from "../p521/evaluateRoleV2Shadow";
import {
  measureAndAttestStage02OfficialChordSafety,
  stage02OfficialSafetyAttestationPath,
  stage02OfficialSafetyDirectory,
  stage02OfficialSafetyReportPath,
} from "../p521/measureRoleV2OfficialChordSafety";
import { lockedP521OfficialSafetyCorpus } from "../p521/roleV2OfficialSafetyContract";
import type { P524OfficialMetrics } from "./promotionContract";

const execFileAsync = promisify(execFile);
const freshnessPath = `${stage02OfficialSafetyDirectory}/p524-stage02-freshness.json`;
const filesystemTimestampToleranceMs = 2_000;
export const p524ScopedCandidatePaths = Object.freeze([
  "docs/phase5.24/execution-state.json",
  "docs/phase5.24/reports/P5.24-02-fragment-consolidator-shadow.md",
  "docs/phase5.24/reports/P5.24-03-flagged-integration.md",
  "scripts/evaluate-voice-aware-reranker.ts",
  "scripts/p521/evaluateRoleV2Shadow.ts",
  "scripts/p521/measureRoleV2OfficialChordSafety.ts",
  "scripts/p524/harmonicFragmentFixtures.ts",
  "scripts/p524/fragmentConsolidator.test.ts",
  "scripts/p524/fragmentConsolidator.ts",
  "scripts/p524/fragmentConsolidatorBenchmark.ts",
  "scripts/p524/fragmentConsolidatorCore.ts",
  "scripts/p524/fragmentConsolidatorSafety.test.ts",
  "scripts/p524/fragmentConsolidatorScale.test.ts",
  "scripts/p524/harmonicIdentity.ts",
  "scripts/p524/shadowEvidence.ts",
  "scripts/p524/officialEvidence.ts",
  "scripts/p524/stage02Promotion.ts",
  "src/domain/midi/analysis.ts",
  "src/domain/midi/legacy.ts",
  "src/domain/midi/phase4Analyzer.ts",
  "src/domain/midi/types.ts",
  "src/domain/midi/harmonicState/contracts.ts",
  "src/domain/midi/harmonicState/fragmentConsolidator.ts",
  "src/domain/midi/harmonicState/fragmentConsolidatorCore.ts",
  "src/domain/midi/harmonicState/harmonicIdentity.ts",
  "src/domain/midi/harmonicState/shadowEvidence.ts",
  "src/domain/midi/harmonicStateConsolidation.ts",
  "src/domain/midi/harmonicStateConsolidation.test.ts",
] as const);
export const p524ScopedCandidatePathCount = p524ScopedCandidatePaths.length;


export interface P524OfficialFreshnessEnvelope {
  readonly schemaVersion: 1;
  readonly kind: "p524-stage02-official-freshness";
  readonly promotionRunNonce: string;
  readonly startedAtMs: number;
  readonly completedAtMs: number;
  readonly observedAfterWriteAtMs: number;
  readonly candidateContentSha256: string;
  readonly candidatePathCount: typeof p524ScopedCandidatePathCount;
  readonly codeCandidateCommit: string;
  readonly reportSha256: string;
  readonly attestationSha256: string;
  readonly cleanCaseCount: typeof lockedP521OfficialSafetyCorpus.clean.caseCount;
  readonly dirtyCaseCount: typeof lockedP521OfficialSafetyCorpus.dirty.caseCount;
}

export interface P524FreshOfficialValidationInput {
  readonly reportBytes: Uint8Array;
  readonly attestationBytes: Uint8Array;
  readonly envelope: unknown;
  readonly expectedNonce: string;
  readonly currentCommit: string;
  readonly reportMtimeMs: number;
  readonly attestationMtimeMs: number;
  readonly envelopeMtimeMs: number;
  readonly validationNowMs: number;
  readonly candidateContentSha256: string;
}

export interface P524FreshOfficialEvidence {
  readonly status: "pass" | "fail";
  readonly reasons: readonly string[];
  readonly metrics: P524OfficialMetrics | null;
  readonly deterministic: boolean;
  readonly codeCandidateCommit: string | null;
  readonly productionOutputsUnchanged: boolean;
}

/**
 * Runs the existing authoritative evaluator and validator after this process
 * starts, then binds their exact bytes to a same-process nonce and current HEAD.
 */
export async function measureP524FreshOfficialEvidence(): Promise<P524FreshOfficialEvidence> {
  try {
    const expectedNonce = randomUUID();
    const startedAtMs = Date.now();
    const startingCommit = await currentHead();
    const startingCandidateContentSha256 = await hashScopedCandidateContent();
    await measureAndAttestStage02OfficialChordSafety();
    const completedAtMs = Date.now();
    const [reportBytes, attestationBytes, reportStats, attestationStats] = await Promise.all([
      readFile(resolve(stage02OfficialSafetyReportPath)),
      readFile(resolve(stage02OfficialSafetyAttestationPath)),
      stat(resolve(stage02OfficialSafetyReportPath)),
      stat(resolve(stage02OfficialSafetyAttestationPath)),
    ]);
    const observedAfterWriteAtMs = Date.now();
    const envelope: P524OfficialFreshnessEnvelope = {
      schemaVersion: 1,
      kind: "p524-stage02-official-freshness",
      promotionRunNonce: expectedNonce,
      startedAtMs,
      completedAtMs,
      observedAfterWriteAtMs,
      candidateContentSha256: startingCandidateContentSha256,
      candidatePathCount: p524ScopedCandidatePathCount,
      codeCandidateCommit: startingCommit,
      reportSha256: sha256(reportBytes),
      attestationSha256: sha256(attestationBytes),
      cleanCaseCount: lockedP521OfficialSafetyCorpus.clean.caseCount,
      dirtyCaseCount: lockedP521OfficialSafetyCorpus.dirty.caseCount,
    };
    await writeFile(resolve(freshnessPath), `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
    const [envelopeBytes, envelopeStats, currentCommit] = await Promise.all([
      readFile(resolve(freshnessPath)),
      stat(resolve(freshnessPath)),
      currentHead(),
    ]);
    const storedEnvelope = JSON.parse(envelopeBytes.toString("utf8")) as unknown;
    const verified = validateP524FreshOfficialEvidence({
      reportBytes,
      attestationBytes,
      envelope: storedEnvelope,
      expectedNonce,
      currentCommit,
      reportMtimeMs: reportStats.mtimeMs,
      attestationMtimeMs: attestationStats.mtimeMs,
      envelopeMtimeMs: envelopeStats.mtimeMs,
      validationNowMs: Date.now(),
      candidateContentSha256: startingCandidateContentSha256,
    });
    if (verified.status !== "pass") return verified;
    const productionTreeClean = await protectedProductionTreeIsClean();
    const [finalCommit, finalCandidateContentSha256] = await Promise.all([currentHead(), hashScopedCandidateContent()]);
    if (!productionTreeClean || finalCommit !== currentCommit || currentCommit !== startingCommit
      || finalCandidateContentSha256 !== startingCandidateContentSha256) {
      return failure("official measurement did not preserve the current production candidate");
    }
    return { ...verified, productionOutputsUnchanged: true };
  } catch {
    return failure("fresh official Stage02 evaluation could not be verified");
  }
}

/** Pure freshness adapter; semantic/corpus/metric validation remains authoritative. */
export function validateP524FreshOfficialEvidence(
  input: P524FreshOfficialValidationInput,
): P524FreshOfficialEvidence {
  const envelope = asEnvelope(input.envelope);
  const reasons: string[] = [];
  if (!envelope) reasons.push("freshness envelope schema is invalid");
  if (!validCommit(input.currentCommit)) reasons.push("current candidate commit is invalid");
  if (!Number.isFinite(input.validationNowMs)) reasons.push("validation clock is invalid");

  if (envelope) {
    if (envelope.promotionRunNonce !== input.expectedNonce) reasons.push("freshness nonce is stale or copied");
    if (envelope.codeCandidateCommit !== input.currentCommit) reasons.push("freshness envelope targets another HEAD");
    if (envelope.candidateContentSha256 !== input.candidateContentSha256
      || envelope.candidatePathCount !== p524ScopedCandidatePathCount) {
      reasons.push("freshness envelope does not match scoped candidate content");
    }
    if (envelope.reportSha256 !== sha256(input.reportBytes)
      || envelope.attestationSha256 !== sha256(input.attestationBytes)) {
      reasons.push("freshness envelope hashes do not match the measured pair");
    }
    if (envelope.cleanCaseCount !== lockedP521OfficialSafetyCorpus.clean.caseCount
      || envelope.dirtyCaseCount !== lockedP521OfficialSafetyCorpus.dirty.caseCount) {
      reasons.push("freshness envelope does not identify the locked full corpus counts");
    }
    if (!validRunTimes(input, envelope)) reasons.push("official evidence was not generated inside this promotion run");
  }

  let attestation: unknown;
  try {
    attestation = JSON.parse(Buffer.from(input.attestationBytes).toString("utf8")) as unknown;
  } catch {
    reasons.push("official attestation bytes are invalid");
  }
  let gate: ReturnType<typeof validateStage02OfficialChordSafetyAttestation> | undefined;
  if (attestation !== undefined && validCommit(input.currentCommit)) {
    gate = validateStage02OfficialChordSafetyAttestation(
      input.reportBytes,
      attestation,
      input.currentCommit,
      false,
    );
    if (gate.status !== "pass" || !gate.evaluated || !gate.deterministic || gate.metrics === null) {
      reasons.push(...(gate.reasons.length > 0 ? gate.reasons : ["authoritative official safety validation failed"]));
    }
  }
  if (reasons.length > 0 || !gate?.metrics) return failure(...reasons);
  return {
    status: "pass",
    reasons: [],
    metrics: toP524Metrics(gate.metrics),
    deterministic: true,
    codeCandidateCommit: input.currentCommit,
    productionOutputsUnchanged: false,
  };
}

function validRunTimes(input: P524FreshOfficialValidationInput, envelope: P524OfficialFreshnessEnvelope): boolean {
  const values = [
    envelope.startedAtMs,
    envelope.completedAtMs,
    envelope.observedAfterWriteAtMs,
    input.reportMtimeMs,
    input.attestationMtimeMs,
    input.envelopeMtimeMs,
    input.validationNowMs,
  ];
  return values.every((value) => Number.isFinite(value) && value >= 0)
    && envelope.startedAtMs <= envelope.completedAtMs
    && envelope.completedAtMs <= envelope.observedAfterWriteAtMs
    && envelope.observedAfterWriteAtMs <= input.validationNowMs + filesystemTimestampToleranceMs
    && input.reportMtimeMs >= envelope.startedAtMs - filesystemTimestampToleranceMs
    && input.reportMtimeMs <= envelope.observedAfterWriteAtMs + filesystemTimestampToleranceMs
    && input.attestationMtimeMs >= envelope.startedAtMs - filesystemTimestampToleranceMs
    && input.attestationMtimeMs <= envelope.observedAfterWriteAtMs + filesystemTimestampToleranceMs
    && input.envelopeMtimeMs >= envelope.completedAtMs - filesystemTimestampToleranceMs
    && input.envelopeMtimeMs <= input.validationNowMs + filesystemTimestampToleranceMs;
}

function asEnvelope(value: unknown): P524OfficialFreshnessEnvelope | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<P524OfficialFreshnessEnvelope>;
  return candidate.schemaVersion === 1
    && candidate.kind === "p524-stage02-official-freshness"
    && typeof candidate.promotionRunNonce === "string" && candidate.promotionRunNonce.length > 0
    && typeof candidate.startedAtMs === "number"
    && typeof candidate.completedAtMs === "number"
    && typeof candidate.codeCandidateCommit === "string"
    && typeof candidate.observedAfterWriteAtMs === "number"
    && typeof candidate.candidateContentSha256 === "string"
    && candidate.candidatePathCount === p524ScopedCandidatePathCount
    && typeof candidate.reportSha256 === "string"
    && typeof candidate.attestationSha256 === "string"
    && typeof candidate.cleanCaseCount === "number"
    && typeof candidate.dirtyCaseCount === "number"
    ? candidate as P524OfficialFreshnessEnvelope
    : undefined;
}

function toP524Metrics(metrics: OfficialChordSafetyMetrics): P524OfficialMetrics {
  return {
    rootAt1: metrics.rootAt1,
    qualityAt1: metrics.qualityAt1,
    exactAt1: metrics.exactAt1,
    boundaryPrecision: metrics.boundaryPrecision,
    boundaryRecall: metrics.boundaryRecall,
  };
}

export async function hashScopedCandidateContent(): Promise<string> {
  const hash = createHash("sha256");
  const sortedPaths = [...p524ScopedCandidatePaths].sort((left, right) => left.localeCompare(right));
  for (const path of sortedPaths) {
    const bytes = await readFile(resolve(path));
    hash.update(path.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}
async function currentHead(): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), windowsHide: true });
  const commit = stdout.trim();
  if (!validCommit(commit)) throw new Error("current candidate commit is invalid");
  return commit;
}

async function protectedProductionTreeIsClean(): Promise<boolean> {
  const { stdout } = await execFileAsync("git", [
    "status", "--porcelain=v1", "--", "src", "src-tauri", "package.json", "package-lock.json",
  ], { cwd: process.cwd(), windowsHide: true });
  return stdout.trim().length === 0;
}

function validCommit(value: string): boolean {
  return /^[a-f0-9]{40}$/i.test(value);
}

function failure(...reasons: string[]): P524FreshOfficialEvidence {
  return {
    status: "fail",
    reasons: reasons.length > 0 ? reasons : ["fresh official Stage02 evidence is invalid"],
    metrics: null,
    deterministic: false,
    codeCandidateCommit: null,
    productionOutputsUnchanged: false,
  };
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
