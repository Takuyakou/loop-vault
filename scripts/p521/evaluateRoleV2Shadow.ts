import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { normalizeNotes } from "../../src/domain/midi/normalize";
import { parseMidi } from "../../src/domain/midi/parser";
import {
  inferRoleV2Shadow,
  roleV2ShadowClassifierVersion,
  type RoleV2ShadowConfidenceBucket,
  type RoleV2ShadowEvidenceKind,
} from "../../src/domain/midi/voiceRoleV2ShadowClassifier";
import { extractRoleV2ShadowFeatures } from "../../src/domain/midi/voiceRoleV2ShadowFeatures";
import { annotateVoiceRoles, buildVoiceFeatureInputs } from "../../src/domain/midi/voiceRoles";
import { buildVoices } from "../../src/domain/midi/voices";
import type { VoiceRole } from "../../src/domain/midi/types";
import {
  anonymousFixtureId,
  calculateRoleBaseline,
  loadSuppliedFixturePack,
  parseSuppliedVoiceKey,
  verifyPackChecksums,
  type ApprovedFixtureRegistry,
  type RoleBaselineMetrics,
  type SuppliedFixtureDefinition,
} from "./importSuppliedRoleFixturePack";
import type { ExpectedRole } from "./roleGroundTruthTemplate";
import { lockedP521OfficialSafetyCorpus } from "./roleV2OfficialSafetyContract";

const execFileAsync = promisify(execFile);
const defaultPackDirectory = ".local-evaluation/p521-supplied-role-fixtures";
const defaultRegistryPath = ".local-evaluation/p521-role-ground-truth/supplied-fixture-baseline/approved-role-registry.json";
const defaultOfficialChordSafetyReportPath = ".local-evaluation/p521-role-v2-shadow/official-safety-stage02/report.json";
const defaultOfficialChordSafetyAttestationPath = ".local-evaluation/p521-role-v2-shadow/official-safety-stage02/attestation.json";
const stage02OfficialSafetyCorpusContract = "p521-stage02-registered-worktree-phase365-full-clean";
const defaultOutputDirectory = ".local-evaluation/p521-role-v2-shadow";

/** Fixed Stage 00 values. This is a lock, not a tuned candidate target. */
export const lockedP521RolePromotionBaseline = Object.freeze({
  manualCorrectionBurden: 0.2,
  exactRoleAccuracy: 0.8,
  melodyRecall: 0.6,
  harmonyPrecision: 1,
  bassPrecision: 1,
  percussionPrecision: 1,
});

/** Current-head ChordDrip safety values locked by Stage 00. */
export const lockedP521OfficialChordSafetyBaseline = Object.freeze({
  rootAt1: 0.581897,
  qualityAt1: 0.610453,
  exactAt1: 0.136853,
  boundaryPrecision: 0.765475,
  boundaryRecall: 0.900864,
  maximumExactAt1Decline: 0.0025,
});

export interface OfficialChordSafetyMetrics {
  rootAt1: number;
  qualityAt1: number;
  exactAt1: number;
  boundaryPrecision: number;
  boundaryRecall: number;
}

export interface OfficialChordSafetyGate {
  status: "pass" | "missing" | "fail";
  evaluated: boolean;
  deterministic: boolean;
  metrics: OfficialChordSafetyMetrics | null;
  reasons: readonly string[];
}

interface Stage02OfficialChordSafetyAttestation {
  schemaVersion: 1;
  kind: "p521-stage02-official-chord-safety-attestation";
  codeCandidateCommit: string;
  codeCandidatePolicy: typeof lockedP521OfficialSafetyCorpus.codeCandidatePolicy;
  classifierVersion: typeof roleV2ShadowClassifierVersion;
  corpusContract: typeof stage02OfficialSafetyCorpusContract;
  cleanManifest: { identity: string; fileCount: number };
  dirtyManifest: { identity: string; fileCount: number };
  report: {
    kind: "p521-stage02-official-chord-safety-report";
    sha256: string;
    expectedMode: typeof lockedP521OfficialSafetyCorpus.expectedMode;
    fullCleanCaseCount: typeof lockedP521OfficialSafetyCorpus.clean.caseCount;
    fullDirtyCaseCount: typeof lockedP521OfficialSafetyCorpus.dirty.caseCount;
  };
  official: {
    deterministic: boolean;
    metrics: OfficialChordSafetyMetrics;
  };
}

export interface RoleV2ShadowVoiceRow {
  fixtureId: string;
  voiceIndex: number;
  expectedRole: ExpectedRole;
  currentRole: VoiceRole;
  candidateRole: VoiceRole;
  changedFromCurrent: boolean;
  confidenceBucket: RoleV2ShadowConfidenceBucket;
  evidenceKinds: readonly RoleV2ShadowEvidenceKind[];
}

export interface RoleV2ShadowEvaluation {
  schemaVersion: 1;
  kind: "p521-role-v2-shadow-evaluation";
  classifierVersion: typeof roleV2ShadowClassifierVersion;
  productionRoleV1Changed: false;
  sourcePathsIncluded: false;
  rawMidiIncluded: false;
  rawTitlesIncluded: false;
  expectedRoles: "fixture-defined-ground-truth";
  currentPredictionIsNotTruth: true;
  v1Metrics: RoleBaselineMetrics;
  candidateMetrics: RoleBaselineMetrics;
  metricDelta: RoleMetricDelta;
  rows: readonly RoleV2ShadowVoiceRow[];
  officialChordSafety: OfficialChordSafetyGate;
  promotionDecision: RoleV2ShadowPromotionDecision;
}

export interface RoleMetricDelta {
  exactRoleAccuracy: number | null;
  manualCorrectionCount: number;
  manualCorrectionBurden: number | null;
  mixedPredictionRate: number | null;
  melodyRecall: number | null;
  harmonyPrecision: number | null;
  bassPrecision: number | null;
  percussionPrecision: number | null;
}

export interface RoleV2ShadowPromotionDecision {
  status: "pass-to-stage03" | "fail-stop-promotion";
  roleMetricGatePassed: boolean;
  officialChordSafetyGatePassed: boolean;
  deterministic: boolean;
  reasons: readonly string[];
}

interface CliOptions {
  packDirectory?: string;
  registryPath?: string;
  officialReportPath?: string;
  officialAttestationPath?: string;
  outputDirectory?: string;
}

export async function evaluateRoleV2ShadowPack(
  packDirectory: string,
  registry: ApprovedFixtureRegistry,
  officialChordSafety: OfficialChordSafetyGate,
): Promise<RoleV2ShadowEvaluation> {
  const packRoot = resolveIgnoredLocalPath(packDirectory, "fixture pack");
  const pack = await loadSuppliedFixturePack(packRoot);
  await verifyPackChecksums(packRoot, pack.manifest.fixtures);
  verifyApprovedRegistryFixtureTruth(registry, pack.manifest.fixtures);
  const registryByFixtureId = new Map(registry.fixtures.map((fixture) => [fixture.fixture.id, fixture]));
  if (registryByFixtureId.size !== registry.fixtures.length) {
    throw new Error("approved fixture registry has duplicate anonymous IDs");
  }
  const candidateByVoiceId = new Map<string, ReturnType<typeof inferRoleV2Shadow>>();

  for (const fixture of pack.manifest.fixtures) {
    const bytes = new Uint8Array(await readFile(resolvePackMidiPath(packRoot, fixture.file)));
    const anonymousId = anonymousFixtureId(fixture.fixtureId);
    const approvedFixture = registryByFixtureId.get(anonymousId);
    if (!approvedFixture) throw new Error("approved fixture registry does not cover the supplied pack");

    const data = parseMidi(bytes);
    const voices = buildVoices(data);
    const normalized = normalizeNotes(data);
    const v1Voices = annotateVoiceRoles(voices, buildVoiceFeatureInputs(voices, normalized));
    const features = extractRoleV2ShadowFeatures(v1Voices, normalized);
    for (const voice of approvedFixture.voices) {
      const v1Voice = v1Voices.find((entry) => entry.id === `${voice.trackIndex}:${voice.channelIndex}`);
      if (!v1Voice || v1Voice.inferredRole !== voice.currentAutomaticRole) {
        throw new Error("current Role v1 no longer matches the approved Stage 00 registry");
      }
      const feature = features.get(`${voice.trackIndex}:${voice.channelIndex}`);
      if (!feature) throw new Error("shadow feature extraction did not cover an approved Voice");
      candidateByVoiceId.set(voice.voiceId, inferRoleV2Shadow(feature));
    }
  }

  if (candidateByVoiceId.size !== registry.fixtures.flatMap((fixture) => fixture.voices).length) {
    throw new Error("supplied pack and approved fixture registry Voice counts differ");
  }
  const v1Metrics = calculateRoleBaseline(registry);
  assertLockedV1Baseline(v1Metrics);
  return evaluateRoleV2ShadowRegistry(registry, candidateByVoiceId, true, officialChordSafety);
}

/**
 * Pure comparison seam for tests and for the local pack reader. It does not
 * mutate the approved registry or write an artifact.
 */
/**
 * Ensures Stage 02 evaluates precisely the Stage 00-approved anonymous roles.
 * It compares only fixture hashes, anonymous IDs, track/channel positions, and
 * roles; raw names, titles, paths, and notes never enter the diagnostic.
 */
export function verifyApprovedRegistryFixtureTruth(
  registry: ApprovedFixtureRegistry,
  fixtures: readonly SuppliedFixtureDefinition[],
): void {
  const registryByFixtureId = new Map(registry.fixtures.map((fixture) => [fixture.fixture.id, fixture]));
  if (registryByFixtureId.size !== registry.fixtures.length || registryByFixtureId.size !== fixtures.length) {
    throw new Error("approved fixture registry does not match the supplied synthetic pack");
  }
  for (const fixture of fixtures) {
    const approved = registryByFixtureId.get(anonymousFixtureId(fixture.fixtureId));
    if (!approved || approved.voices.length !== fixture.groundTruth.length) {
      throw new Error("approved fixture registry does not match the supplied synthetic pack");
    }
    const expectedByPosition = new Map<string, ExpectedRole>();
    for (const entry of fixture.groundTruth) {
      const position = parseSuppliedVoiceKey(entry.voiceKey);
      if (expectedByPosition.has(position)) {
        throw new Error("approved fixture registry does not match the supplied synthetic pack");
      }
      expectedByPosition.set(position, entry.expectedRole);
    }
    for (const voice of approved.voices) {
      const expected = expectedByPosition.get(`${voice.trackIndex}:${voice.channelIndex}`);
      if (!expected || voice.expectedRole !== expected) {
        throw new Error("approved fixture registry does not match the supplied synthetic pack");
      }
    }
  }
}
export function evaluateRoleV2ShadowRegistry(
  registry: ApprovedFixtureRegistry,
  candidateByVoiceId: ReadonlyMap<string, ReturnType<typeof inferRoleV2Shadow>>,
  deterministic: boolean,
  officialChordSafety: OfficialChordSafetyGate,
): RoleV2ShadowEvaluation {
  const rows = registry.fixtures.flatMap((fixture) => fixture.voices.map((voice) => {
    const candidate = candidateByVoiceId.get(voice.voiceId);
    if (!candidate) throw new Error("candidate role is missing for an approved Voice");
    return {
      fixtureId: fixture.fixture.id,
      voiceIndex: voice.voiceIndex,
      expectedRole: requiredExpectedRole(voice.expectedRole),
      currentRole: voice.currentAutomaticRole,
      candidateRole: candidate.role,
      changedFromCurrent: candidate.role !== voice.currentAutomaticRole,
      confidenceBucket: candidate.confidenceBucket,
      evidenceKinds: candidate.evidenceKinds,
    };
  }));
  const candidateMetrics = calculateRoleBaseline(candidateRegistry(registry, candidateByVoiceId));
  const v1Metrics = calculateRoleBaseline(registry);
  return {
    schemaVersion: 1,
    kind: "p521-role-v2-shadow-evaluation",
    classifierVersion: roleV2ShadowClassifierVersion,
    productionRoleV1Changed: false,
    sourcePathsIncluded: false,
    rawMidiIncluded: false,
    rawTitlesIncluded: false,
    expectedRoles: "fixture-defined-ground-truth",
    currentPredictionIsNotTruth: true,
    v1Metrics,
    candidateMetrics,
    metricDelta: metricDelta(v1Metrics, candidateMetrics),
    rows: rows.sort((left, right) => left.fixtureId.localeCompare(right.fixtureId) || left.voiceIndex - right.voiceIndex),
    officialChordSafety,
    promotionDecision: decideP521RoleV2ShadowPromotion(candidateMetrics, deterministic, officialChordSafety),
  };
}

export function decideP521RoleV2ShadowPromotion(
  metrics: RoleBaselineMetrics,
  deterministic: boolean,
  officialChordSafety: OfficialChordSafetyGate,
): RoleV2ShadowPromotionDecision {
  const roleFailures: string[] = [];
  const baseline = lockedP521RolePromotionBaseline;
  if (!strictlyBelow(metrics.manualCorrectionBurden, baseline.manualCorrectionBurden)) {
    roleFailures.push("manual correction burden is not strictly below the Stage 00 lock");
  }
  requireAtLeast(roleFailures, "exact role accuracy", metrics.exactRoleAccuracy, baseline.exactRoleAccuracy);
  requireAtLeast(roleFailures, "melody recall", metrics.melodyRecall, baseline.melodyRecall);
  requireAtLeast(roleFailures, "harmony precision", metrics.harmonyPrecision, baseline.harmonyPrecision);
  requireAtLeast(roleFailures, "bass precision", metrics.bassPrecision, baseline.bassPrecision);
  requireAtLeast(roleFailures, "percussion precision", metrics.percussionPrecision, baseline.percussionPrecision);
  if (!deterministic) roleFailures.push("shadow output is not deterministic");
  const officialFailures = officialChordSafety.status === "pass"
    ? []
    : officialChordSafety.reasons.map((reason) => `official chord safety: ${reason}`);
  const failures = [...roleFailures, ...officialFailures];

  return {
    status: failures.length ? "fail-stop-promotion" : "pass-to-stage03",
    roleMetricGatePassed: roleFailures.length === 0,
    officialChordSafetyGatePassed: officialChordSafety.status === "pass",
    deterministic,
    reasons: failures,
  };
}

export async function writeRoleV2ShadowEvaluation(
  outputDirectory: string,
  evaluation: RoleV2ShadowEvaluation,
  deterministic: boolean,
): Promise<void> {
  const output = resolveIgnoredLocalPath(outputDirectory, "output directory");
  await mkdir(output, { recursive: true });
  const artifact = { ...evaluation, deterministic };
  await writeFile(resolve(output, "role-v2-shadow.json"), stableJson(artifact), "utf8");
  await writeFile(resolve(output, "role-v2-shadow.md"), renderMarkdown(artifact), "utf8");
}

export function parseCliOptions(args: readonly string[]): CliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--run-cli") continue;
    if (argument !== "--pack" && argument !== "--registry" && argument !== "--official-report" && argument !== "--official-attestation" && argument !== "--out") {
      throw new Error("Usage: --run-cli [--pack <ignored-local-directory>] [--registry <ignored-local-file>] [--official-report <ignored-local-file>] [--official-attestation <ignored-local-file>] [--out <ignored-local-directory>]");
    }
    if (values.has(argument)) throw new Error(`Duplicate flag: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    values.set(argument, value);
    index += 1;
  }
  return {
    packDirectory: values.get("--pack"),
    registryPath: values.get("--registry"),
    officialReportPath: values.get("--official-report"),
    officialAttestationPath: values.get("--official-attestation"),
    outputDirectory: values.get("--out"),
  };
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const packDirectory = options.packDirectory ?? await findSinglePackDirectory(defaultPackDirectory);
  const registry = await readApprovedFixtureRegistry(options.registryPath ?? defaultRegistryPath);
  const officialChordSafety = await readStage02OfficialChordSafetyReport(
    options.officialReportPath ?? defaultOfficialChordSafetyReportPath,
    options.officialAttestationPath ?? defaultOfficialChordSafetyAttestationPath,
  );
  const outputDirectory = options.outputDirectory ?? defaultOutputDirectory;
  const first = await evaluateRoleV2ShadowPack(packDirectory, registry, officialChordSafety);
  const second = await evaluateRoleV2ShadowPack(packDirectory, registry, officialChordSafety);
  const deterministic = stableJson(first) === stableJson(second);
  const evaluation = {
    ...first,
    promotionDecision: decideP521RoleV2ShadowPromotion(first.candidateMetrics, deterministic, officialChordSafety),
  };
  await writeRoleV2ShadowEvaluation(outputDirectory, evaluation, deterministic);
  process.stdout.write(`P5.21 Role v2 shadow: decision=${evaluation.promotionDecision.status}; output=${relative(process.cwd(), resolve(outputDirectory)) || "."}.\n`);
}

export async function readStage02OfficialChordSafetyReport(
  reportPath: string,
  attestationPath: string,
): Promise<OfficialChordSafetyGate> {
  try {
    const [reportBytes, attestation, candidateCommit] = await Promise.all([
      readFile(resolveIgnoredLocalPath(reportPath, "official chord safety report")),
      readJson(resolveIgnoredLocalPath(attestationPath, "official chord safety attestation")),
      currentCandidateCommit(),
    ]);
    const attestedCodeCandidate = asRecord(attestation)?.codeCandidateCommit;
    const docsOnlyDescendant = typeof attestedCodeCandidate === "string"
      && await isCurrentCodeCandidateOrDocsOnlyDescendant(attestedCodeCandidate, candidateCommit);
    return validateStage02OfficialChordSafetyAttestation(reportBytes, attestation, candidateCommit, docsOnlyDescendant);
  } catch {
    return missingOfficialChordSafety("fresh Stage 02 official chord safety attestation is unavailable");
  }
}

/**
 * Validates a fresh report/attestation pair without retaining source paths.
 * The current candidate, exact report bytes, full clean corpus contract, and
 * expected evaluator mode must all agree before metric comparison is allowed.
 */
export function validateStage02OfficialChordSafetyAttestation(
  reportBytes: Uint8Array,
  attestationValue: unknown,
  currentCandidateCommit: string,
  codeCandidateIsCurrentOrDocsOnlyDescendant = false,
): OfficialChordSafetyGate {
  const attestation = asStage02Attestation(attestationValue);
  if (!attestation) return invalidOfficialChordSafety("official safety attestation schema is invalid");
  if (attestation.codeCandidateCommit !== currentCandidateCommit && !codeCandidateIsCurrentOrDocsOnlyDescendant) {
    return invalidOfficialChordSafety("official safety attestation is stale for the current code candidate");
  }
  if (attestation.codeCandidatePolicy !== lockedP521OfficialSafetyCorpus.codeCandidatePolicy) {
    return invalidOfficialChordSafety("official safety attestation has an unsupported code candidate policy");
  }
  if (attestation.classifierVersion !== roleV2ShadowClassifierVersion) {
    return invalidOfficialChordSafety("official safety attestation targets a different shadow classifier");
  }
  if (attestation.corpusContract !== stage02OfficialSafetyCorpusContract
    || attestation.cleanManifest.identity !== lockedP521OfficialSafetyCorpus.clean.identity
    || attestation.cleanManifest.fileCount !== lockedP521OfficialSafetyCorpus.clean.caseCount
    || attestation.dirtyManifest.identity !== lockedP521OfficialSafetyCorpus.dirty.identity
    || attestation.dirtyManifest.fileCount !== lockedP521OfficialSafetyCorpus.dirty.caseCount) {
    return invalidOfficialChordSafety("official safety attestation does not identify the required full corpus");
  }
  if (attestation.report.kind !== "p521-stage02-official-chord-safety-report"
    || attestation.report.expectedMode !== lockedP521OfficialSafetyCorpus.expectedMode
    || attestation.report.fullCleanCaseCount !== lockedP521OfficialSafetyCorpus.clean.caseCount
    || attestation.report.fullDirtyCaseCount !== lockedP521OfficialSafetyCorpus.dirty.caseCount
    || attestation.report.sha256 !== sha256(reportBytes)) {
    return invalidOfficialChordSafety("official safety report does not match its Stage 02 attestation");
  }
  let report: unknown;
  try {
    report = JSON.parse(Buffer.from(reportBytes).toString("utf8")) as unknown;
  } catch {
    return invalidOfficialChordSafety("official safety report is invalid");
  }
  if (!isFullStage02CleanReport(report)) {
    return invalidOfficialChordSafety("official safety report is not a full clean expected-mode evaluation");
  }
  const safety = evaluateOfficialChordSafetyReport(report);
  if (!safety.metrics || !attestation.official.deterministic || !sameOfficialMetrics(attestation.official.metrics, safety.metrics)) {
    return invalidOfficialChordSafety("official safety attestation metrics or determinism do not match the fresh report");
  }
  return safety;
}

export function evaluateOfficialChordSafetyReport(value: unknown): OfficialChordSafetyGate {
  const report = asRecord(value);
  const results = Array.isArray(report?.results) ? report.results : [];
  const cleanVoiceAware = results.find((result) => {
    const entry = asRecord(result);
    return entry?.category === "clean" && entry.mode === "voice-aware-rerank-v1";
  });
  const entry = asRecord(cleanVoiceAware);
  const metricSource = asRecord(entry?.metrics);
  const metrics = metricSource ? {
    rootAt1: finiteMetric(metricSource.rootAt1),
    qualityAt1: finiteMetric(metricSource.qualityAt1),
    exactAt1: finiteMetric(metricSource.exactAt1),
    boundaryPrecision: finiteMetric(metricSource.boundaryPrecision),
    boundaryRecall: finiteMetric(metricSource.boundaryRecall),
  } : null;
  const deterministic = asRecord(report?.determinism)?.passed === true;
  if (!metrics || Object.values(metrics).some((metric) => metric === null)) {
    return missingOfficialChordSafety("evaluated official chord safety metrics are missing or invalid");
  }
  const completedMetrics = metrics as OfficialChordSafetyMetrics;
  const failures: string[] = [];
  const baseline = lockedP521OfficialChordSafetyBaseline;
  if (completedMetrics.rootAt1 < baseline.rootAt1) failures.push("Root@1 regressed from the Stage 00 lock");
  if (completedMetrics.qualityAt1 < baseline.qualityAt1) failures.push("Quality@1 regressed from the Stage 00 lock");
  if (completedMetrics.exactAt1 < baseline.exactAt1 - baseline.maximumExactAt1Decline) {
    failures.push("Exact@1 declined by more than the 0.25pp Stage 00 tolerance");
  }
  if (completedMetrics.boundaryPrecision < baseline.boundaryPrecision) {
    failures.push("boundary precision regressed from the Stage 00 lock");
  }
  if (completedMetrics.boundaryRecall < baseline.boundaryRecall) {
    failures.push("boundary recall regressed from the Stage 00 lock");
  }
  if (!deterministic) failures.push("official chord safety report is not deterministic");
  return {
    status: failures.length ? "fail" : "pass",
    evaluated: true,
    deterministic,
    metrics: completedMetrics,
    reasons: failures,
  };
}

function isFullStage02CleanReport(value: unknown): boolean {
  const report = asRecord(value);
  if (!report || report.sourceCaseCount !== lockedP521OfficialSafetyCorpus.clean.caseCount
    || report.evaluatedCaseLimitPerCategory !== null) return false;
  const results = Array.isArray(report.results) ? report.results : [];
  const clean = results.some((result) => {
    const entry = asRecord(result);
    return entry?.category === "clean"
      && entry.mode === lockedP521OfficialSafetyCorpus.expectedMode
      && entry.caseCount === lockedP521OfficialSafetyCorpus.clean.caseCount;
  });
  const nonCleanCount = results.reduce((total, result) => {
    const entry = asRecord(result);
    return entry?.category !== "clean" && entry?.mode === lockedP521OfficialSafetyCorpus.expectedMode
      && typeof entry.caseCount === "number"
      ? total + entry.caseCount
      : total;
  }, 0);
  return clean && nonCleanCount === lockedP521OfficialSafetyCorpus.dirty.caseCount;
}

function asStage02Attestation(value: unknown): Stage02OfficialChordSafetyAttestation | undefined {
  const candidate = asRecord(value);
  const clean = asRecord(candidate?.cleanManifest);
  const dirty = asRecord(candidate?.dirtyManifest);
  const report = asRecord(candidate?.report);
  const official = asRecord(candidate?.official);
  const officialMetrics = asRecord(official?.metrics);
  if (!candidate || !clean || !dirty || !report || !official || !officialMetrics) return undefined;
  if (candidate.schemaVersion !== 1
    || candidate.kind !== "p521-stage02-official-chord-safety-attestation"
    || typeof candidate.codeCandidateCommit !== "string"
    || typeof candidate.codeCandidatePolicy !== "string"
    || typeof candidate.classifierVersion !== "string"
    || typeof candidate.corpusContract !== "string"
    || typeof clean.identity !== "string" || typeof clean.fileCount !== "number"
    || typeof dirty.identity !== "string" || typeof dirty.fileCount !== "number"
    || typeof report.kind !== "string" || typeof report.sha256 !== "string"
    || typeof report.expectedMode !== "string" || typeof report.fullCleanCaseCount !== "number"
    || typeof report.fullDirtyCaseCount !== "number"
    || typeof official.deterministic !== "boolean"
    || !isFiniteMetricRecord(officialMetrics)) return undefined;
  return candidate as unknown as Stage02OfficialChordSafetyAttestation;
}

/**
 * A fresh attestation is bound to its code commit. It can survive only a
 * descendant made exclusively of tracked docs changes, so a docs-only closure
 * does not falsely mark the measured code candidate stale.
 */
async function isCurrentCodeCandidateOrDocsOnlyDescendant(
  codeCandidateCommit: string,
  currentCommit: string,
): Promise<boolean> {
  if (codeCandidateCommit === currentCommit) return true;
  try {
    await execFileAsync("git", ["merge-base", "--is-ancestor", codeCandidateCommit, currentCommit], {
      cwd: process.cwd(), windowsHide: true,
    });
    const { stdout } = await execFileAsync("git", ["diff", "--name-only", `${codeCandidateCommit}..${currentCommit}`], {
      cwd: process.cwd(), windowsHide: true,
    });
    const changed = stdout.split(/\r?\n/).filter(Boolean);
    return changed.length > 0 && changed.every((path) => path.startsWith("docs/"));
  } catch {
    return false;
  }
}
function sameOfficialMetrics(left: OfficialChordSafetyMetrics, right: OfficialChordSafetyMetrics): boolean {
  return left.rootAt1 === right.rootAt1
    && left.qualityAt1 === right.qualityAt1
    && left.exactAt1 === right.exactAt1
    && left.boundaryPrecision === right.boundaryPrecision
    && left.boundaryRecall === right.boundaryRecall;
}

function isFiniteMetricRecord(value: Record<string, unknown>): boolean {
  return ["rootAt1", "qualityAt1", "exactAt1", "boundaryPrecision", "boundaryRecall"]
    .every((key) => typeof value[key] === "number" && Number.isFinite(value[key]));
}

function invalidOfficialChordSafety(reason: string): OfficialChordSafetyGate {
  return { status: "fail", evaluated: false, deterministic: false, metrics: null, reasons: [reason] };
}

function missingOfficialChordSafety(reason: string): OfficialChordSafetyGate {
  return {
    status: "missing",
    evaluated: false,
    deterministic: false,
    metrics: null,
    reasons: [reason],
  };
}

async function currentCandidateCommit(): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), windowsHide: true });
  const value = stdout.trim();
  if (!/^[a-f0-9]{40}$/i.test(value)) throw new Error("current candidate commit is invalid");
  return value;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function finiteMetric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function candidateRegistry(
  registry: ApprovedFixtureRegistry,
  candidates: ReadonlyMap<string, ReturnType<typeof inferRoleV2Shadow>>,
): ApprovedFixtureRegistry {
  return {
    ...registry,
    fixtures: registry.fixtures.map((fixture) => ({
      ...fixture,
      voices: fixture.voices.map((voice) => {
        const candidate = candidates.get(voice.voiceId);
        if (!candidate) throw new Error("candidate role is missing for metric evaluation");
        return { ...voice, currentAutomaticRole: candidate.role };
      }),
    })),
  };
}

function metricDelta(before: RoleBaselineMetrics, after: RoleBaselineMetrics): RoleMetricDelta {
  return {
    exactRoleAccuracy: difference(after.exactRoleAccuracy, before.exactRoleAccuracy),
    manualCorrectionCount: after.manualCorrectionCount - before.manualCorrectionCount,
    manualCorrectionBurden: difference(after.manualCorrectionBurden, before.manualCorrectionBurden),
    mixedPredictionRate: difference(after.mixedPredictionRate, before.mixedPredictionRate),
    melodyRecall: difference(after.melodyRecall, before.melodyRecall),
    harmonyPrecision: difference(after.harmonyPrecision, before.harmonyPrecision),
    bassPrecision: difference(after.bassPrecision, before.bassPrecision),
    percussionPrecision: difference(after.percussionPrecision, before.percussionPrecision),
  };
}

function assertLockedV1Baseline(metrics: RoleBaselineMetrics): void {
  const locked = lockedP521RolePromotionBaseline;
  requireEqual("current Role v1 exact role accuracy", metrics.exactRoleAccuracy, locked.exactRoleAccuracy);
  requireEqual("current Role v1 manual correction burden", metrics.manualCorrectionBurden, locked.manualCorrectionBurden);
  requireEqual("current Role v1 melody recall", metrics.melodyRecall, locked.melodyRecall);
  requireEqual("current Role v1 harmony precision", metrics.harmonyPrecision, locked.harmonyPrecision);
  requireEqual("current Role v1 bass precision", metrics.bassPrecision, locked.bassPrecision);
  requireEqual("current Role v1 percussion precision", metrics.percussionPrecision, locked.percussionPrecision);
}

function requireAtLeast(failures: string[], label: string, actual: number | null, minimum: number): void {
  if (actual === null || actual < minimum) failures.push(`${label} is below the Stage 00 lock`);
}

function strictlyBelow(actual: number | null, maximum: number): boolean {
  return actual !== null && actual < maximum;
}

function requireEqual(label: string, actual: number | null, expected: number): void {
  if (actual === null || Math.abs(actual - expected) > Number.EPSILON) {
    throw new Error(`${label} no longer matches the Stage 00 lock`);
  }
}

function requiredExpectedRole(value: ExpectedRole | null): ExpectedRole {
  if (!value) throw new Error("approved fixture Voice is missing expectedRole");
  return value;
}

function difference(after: number | null, before: number | null): number | null {
  return after === null || before === null ? null : rounded(after - before);
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function resolvePackMidiPath(packRoot: string, value: string): string {
  if (!/\.(mid|midi)$/i.test(value)) throw new Error("fixture pack file must be MIDI");
  const target = resolve(packRoot, value);
  const root = resolve(packRoot).toLocaleLowerCase();
  if (!target.toLocaleLowerCase().startsWith(`${root}${sep}`)) throw new Error("fixture MIDI escapes the supplied pack directory");
  return target;
}

function resolveIgnoredLocalPath(value: string, label: string): string {
  const root = resolve(".local-evaluation").toLocaleLowerCase();
  const target = resolve(value);
  if (target.toLocaleLowerCase() === root || target.toLocaleLowerCase().startsWith(`${root}${sep}`)) return target;
  throw new Error(`${label} must remain inside .local-evaluation`);
}

async function findSinglePackDirectory(root: string): Promise<string> {
  const directory = resolveIgnoredLocalPath(root, "fixture pack directory");
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(directory, entry.name));
  if (entries.length !== 1) throw new Error("expected exactly one supplied fixture pack directory");
  return entries[0];
}

async function readApprovedFixtureRegistry(path: string): Promise<ApprovedFixtureRegistry> {
  const target = resolveIgnoredLocalPath(path, "approved fixture registry");
  const value = JSON.parse(await readFile(target, "utf8")) as unknown;
  if (!isApprovedFixtureRegistry(value)) {
    throw new Error("approved fixture registry schema or privacy provenance is invalid");
  }
  return value;
}

function isApprovedFixtureRegistry(value: unknown): value is ApprovedFixtureRegistry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ApprovedFixtureRegistry>;
  return candidate.schemaVersion === 1
    && candidate.kind === "p521-approved-synthetic-role-fixture-registry"
    && candidate.provenance?.fixturePack === "p5.21-supplied-synthetic"
    && candidate.provenance.expectedRoles === "fixture-defined-ground-truth"
    && candidate.provenance.currentPredictionIsNotTruth === true
    && candidate.provenance.sourcePathsIncluded === false
    && candidate.provenance.rawMidiIncluded === false
    && Array.isArray(candidate.fixtures)
    && candidate.fixtures.length > 0
    && candidate.fixtures.every((fixture) => fixture.fixture.sourceIdentity === "local-midi-not-recorded"
      && fixture.voices.length > 0
      && fixture.voices.every((voice) => voice.expectedRole !== null));
}
function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function renderMarkdown(artifact: RoleV2ShadowEvaluation & { deterministic: boolean }): string {
  const metricRows: ReadonlyArray<[string, number | null, number | null, number | null]> = [
    ["Exact role accuracy", artifact.v1Metrics.exactRoleAccuracy, artifact.candidateMetrics.exactRoleAccuracy, artifact.metricDelta.exactRoleAccuracy],
    ["Manual correction burden", artifact.v1Metrics.manualCorrectionBurden, artifact.candidateMetrics.manualCorrectionBurden, artifact.metricDelta.manualCorrectionBurden],
    ["Mixed prediction rate", artifact.v1Metrics.mixedPredictionRate, artifact.candidateMetrics.mixedPredictionRate, artifact.metricDelta.mixedPredictionRate],
    ["Melody recall", artifact.v1Metrics.melodyRecall, artifact.candidateMetrics.melodyRecall, artifact.metricDelta.melodyRecall],
    ["Harmony precision", artifact.v1Metrics.harmonyPrecision, artifact.candidateMetrics.harmonyPrecision, artifact.metricDelta.harmonyPrecision],
    ["Bass precision", artifact.v1Metrics.bassPrecision, artifact.candidateMetrics.bassPrecision, artifact.metricDelta.bassPrecision],
    ["Percussion precision", artifact.v1Metrics.percussionPrecision, artifact.candidateMetrics.percussionPrecision, artifact.metricDelta.percussionPrecision],
  ];
  return [
    "# P5.21 Role v2 Shadow Evaluation",
    "",
    `- Decision: ${artifact.promotionDecision.status}`,
    `- Deterministic repeat: ${artifact.deterministic ? "PASS" : "FAIL"}`,
    "- Production Role v1: unchanged (shadow-only)",
    "- Ground truth: supplied fixture-defined synthetic roles; current prediction is not truth",
    "- Raw MIDI, source paths, and raw titles: not retained",
    `- Official chord safety: ${artifact.officialChordSafety.status.toUpperCase()} (${artifact.officialChordSafety.evaluated ? "evaluated" : "missing"})`,
    ...artifact.officialChordSafety.reasons.map((reason) => `- Official safety: ${reason}`),
    "",
    "Metric | Role v1 | Role v2 candidate | Delta",
    "--- | ---: | ---: | ---:",
    ...metricRows.map(([label, v1, candidate, delta]) => `${label} | ${percent(v1)} | ${percent(candidate)} | ${signedPercent(delta)}`),
    `Manual correction count | ${artifact.v1Metrics.manualCorrectionCount} | ${artifact.candidateMetrics.manualCorrectionCount} | ${artifact.metricDelta.manualCorrectionCount >= 0 ? "+" : ""}${artifact.metricDelta.manualCorrectionCount}`,
    "",
    "## Promotion gate",
    "",
    ...(artifact.promotionDecision.reasons.length
      ? artifact.promotionDecision.reasons.map((reason) => `- FAIL: ${reason}`)
      : ["- PASS: all locked Role and official chord-safety conditions passed; Stage 03 remains a separate authorized step."]),
    "",
    "## Candidate confusion matrix",
    "",
    renderConfusionMatrix(artifact.candidateMetrics),
    "",
  ].join("\n");
}

function renderConfusionMatrix(metrics: RoleBaselineMetrics): string {
  const predictions: readonly VoiceRole[] = ["bass", "harmony", "pad", "melody", "percussion", "mixed"];
  const expected: readonly ExpectedRole[] = ["bass", "harmony", "pad", "melody", "percussion", "mixed", "ambiguous"];
  return [
    `Expected \\ Predicted | ${predictions.join(" | ")}`,
    `--- | ${predictions.map(() => "---:").join(" | ")}`,
    ...expected.map((role) => `${role} | ${predictions.map((prediction) => metrics.confusionMatrix[role][prediction]).join(" | ")}`),
  ].join("\n");
}

function percent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function signedPercent(value: number | null): string {
  return value === null ? "n/a" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pp`;
}

if (process.argv.includes("--run-cli")) {
  void main().catch(() => {
    process.stderr.write("P5.21 Role v2 shadow failed: local input validation failed.\n");
    process.exitCode = 1;
  });
}
