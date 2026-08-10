import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";
import { roleV2ShadowClassifierVersion } from "../../src/domain/midi/voiceRoleV2ShadowClassifier";
import { lockedP521OfficialSafetyCorpus } from "./roleV2OfficialSafetyContract";

const execFileAsync = promisify(execFile);
export const stage02OfficialSafetyDirectory = ".local-evaluation/p521-role-v2-shadow/official-safety-stage02";
export const stage02OfficialSafetyReportPath = `${stage02OfficialSafetyDirectory}/report.json`;
export const stage02OfficialSafetyAttestationPath = `${stage02OfficialSafetyDirectory}/attestation.json`;
const corpusContract = "p521-stage02-registered-worktree-phase365-full-clean";
const expectedMode = lockedP521OfficialSafetyCorpus.expectedMode;

export interface Stage02OfficialSafetyAttestation {
  schemaVersion: 1;
  kind: "p521-stage02-official-chord-safety-attestation";
  codeCandidateCommit: string;
  codeCandidatePolicy: typeof lockedP521OfficialSafetyCorpus.codeCandidatePolicy;
  classifierVersion: typeof roleV2ShadowClassifierVersion;
  corpusContract: typeof corpusContract;
  cleanManifest: { identity: string; fileCount: number };
  dirtyManifest: { identity: string; fileCount: number };
  report: {
    kind: "p521-stage02-official-chord-safety-report";
    sha256: string;
    expectedMode: typeof expectedMode;
    fullCleanCaseCount: typeof lockedP521OfficialSafetyCorpus.clean.caseCount;
    fullDirtyCaseCount: typeof lockedP521OfficialSafetyCorpus.dirty.caseCount;
  };
  official: {
    deterministic: boolean;
    metrics: OfficialChordSafetyMetrics;
  };
}

interface OfficialChordSafetyMetrics {
  rootAt1: number;
  qualityAt1: number;
  exactAt1: number;
  boundaryPrecision: number;
  boundaryRecall: number;
}

interface CorpusPair {
  cleanPath: string;
  dirtyPath: string;
  cleanManifest: { identity: string; fileCount: number };
  dirtyManifest: { identity: string; fileCount: number };
}

/**
 * Runs the official evaluator afresh for Stage 02 and writes an ignored
 * attestation that binds its report to this HEAD and the exact corpus files.
 */
export async function measureAndAttestStage02OfficialChordSafety(): Promise<Stage02OfficialSafetyAttestation> {
  const codeCandidateCommit = await currentHead();
  const corpus = await findRegisteredCorpusPair();
  const outputDirectory = resolveIgnoredLocalPath(stage02OfficialSafetyDirectory);
  await mkdir(outputDirectory, { recursive: true });
  await runOfficialEvaluator(corpus, outputDirectory);
  const report = await readFile(resolve(outputDirectory, "report.json"));
  const official = readOfficialSafetySummary(report);
  const attestation: Stage02OfficialSafetyAttestation = {
    schemaVersion: 1,
    kind: "p521-stage02-official-chord-safety-attestation",
    codeCandidateCommit,
    codeCandidatePolicy: lockedP521OfficialSafetyCorpus.codeCandidatePolicy,
    classifierVersion: roleV2ShadowClassifierVersion,
    corpusContract,
    cleanManifest: corpus.cleanManifest,
    dirtyManifest: corpus.dirtyManifest,
    report: {
      kind: "p521-stage02-official-chord-safety-report",
      sha256: sha256(report),
      expectedMode,
      fullCleanCaseCount: lockedP521OfficialSafetyCorpus.clean.caseCount,
      fullDirtyCaseCount: lockedP521OfficialSafetyCorpus.dirty.caseCount,
    },
    official,
  };
  await writeFile(resolve(outputDirectory, "attestation.json"), `${JSON.stringify(attestation, null, 2)}\n`, "utf8");
  return attestation;
}

function readOfficialSafetySummary(reportBytes: Uint8Array): { deterministic: boolean; metrics: OfficialChordSafetyMetrics } {
  const report = asRecord(JSON.parse(Buffer.from(reportBytes).toString("utf8")) as unknown);
  const results = Array.isArray(report?.results) ? report.results : [];
  const clean = results.find((result) => {
    const entry = asRecord(result);
    return entry?.category === "clean" && entry.mode === expectedMode
      && entry.caseCount === lockedP521OfficialSafetyCorpus.clean.caseCount;
  });
  const nonCleanCaseCount = results.reduce((total, result) => {
    const entry = asRecord(result);
    return entry?.category !== "clean" && entry?.mode === expectedMode && typeof entry.caseCount === "number"
      ? total + entry.caseCount
      : total;
  }, 0);
  const metrics = asRecord(asRecord(clean)?.metrics);
  const summary = metrics ? {
    rootAt1: finiteNumber(metrics.rootAt1),
    qualityAt1: finiteNumber(metrics.qualityAt1),
    exactAt1: finiteNumber(metrics.exactAt1),
    boundaryPrecision: finiteNumber(metrics.boundaryPrecision),
    boundaryRecall: finiteNumber(metrics.boundaryRecall),
  } : undefined;
  const deterministic = asRecord(report?.determinism)?.passed === true;
  if (!report || report.sourceCaseCount !== lockedP521OfficialSafetyCorpus.clean.caseCount
    || report.evaluatedCaseLimitPerCategory !== null
    || nonCleanCaseCount !== lockedP521OfficialSafetyCorpus.dirty.caseCount
    || !summary || Object.values(summary).some((value) => value === undefined)) {
    throw new Error("official evaluator did not produce the required full safety report");
  }
  return { deterministic, metrics: summary as OfficialChordSafetyMetrics };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
async function runOfficialEvaluator(corpus: CorpusPair, reportDirectory: string): Promise<void> {
  try {
    await execFileAsync(process.execPath, [
      resolve("node_modules/vite-node/vite-node.mjs"),
      resolve("scripts/evaluate-voice-aware-reranker.ts"),
      "--run-cli",
      "--report-only",
      "--clean", corpus.cleanPath,
      "--dirty", corpus.dirtyPath,
      "--report", reportDirectory,
    ], { cwd: process.cwd(), windowsHide: true, maxBuffer: 1024 * 1024 });
  } catch {
    throw new Error("official evaluator execution failed");
  }
}

async function findRegisteredCorpusPair(): Promise<CorpusPair> {
  const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
    cwd: process.cwd(),
    windowsHide: true,
  });
  const roots = stdout.split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
  const pairs = await Promise.all(roots.map(async (root) => {
    const cleanPath = resolve(root, "docs/loop-vault-evaluation-corpus/manifest.json");
    const dirtyPath = resolve(root, ".local-evaluation/phase3.6.5-dirty/manifest.json");
    try {
      const [clean, dirty] = await Promise.all([readManifestSummary(cleanPath), readManifestSummary(dirtyPath)]);
      return { cleanPath, dirtyPath, cleanManifest: clean, dirtyManifest: dirty };
    } catch {
      return undefined;
    }
  }));
  const available = pairs.filter((pair): pair is CorpusPair => pair !== undefined);
  return selectExactLockedCorpusPair(available);
}

/** Selects only the exact Stage 00 manifest identities; same-size variants fail closed. */
export function selectExactLockedCorpusPair<T extends {
  cleanManifest: { identity: string; fileCount: number };
  dirtyManifest: { identity: string; fileCount: number };
}>(pairs: readonly T[]): T {
  const matches = pairs.filter((pair) => pair.cleanManifest.identity === lockedP521OfficialSafetyCorpus.clean.identity
    && pair.cleanManifest.fileCount === lockedP521OfficialSafetyCorpus.clean.caseCount
    && pair.dirtyManifest.identity === lockedP521OfficialSafetyCorpus.dirty.identity
    && pair.dirtyManifest.fileCount === lockedP521OfficialSafetyCorpus.dirty.caseCount);
  if (matches.length !== 1) throw new Error("expected exactly one exact locked clean/dirty corpus pair");
  return matches[0];
}

async function readManifestSummary(path: string): Promise<{ identity: string; fileCount: number }> {
  const bytes = await readFile(path);
  const value = JSON.parse(bytes.toString("utf8")) as { schemaVersion?: unknown; files?: unknown };
  if (value.schemaVersion !== 1 || !Array.isArray(value.files) || value.files.length === 0) {
    throw new Error("registered corpus manifest is invalid");
  }
  return { identity: `sha256:${sha256(bytes)}`, fileCount: value.files.length };
}

async function currentHead(): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), windowsHide: true });
  const value = stdout.trim();
  if (!/^[a-f0-9]{40}$/i.test(value)) throw new Error("current candidate commit is invalid");
  return value;
}

function resolveIgnoredLocalPath(value: string): string {
  const root = resolve(".local-evaluation").toLocaleLowerCase();
  const target = resolve(value);
  if (target.toLocaleLowerCase() === root || target.toLocaleLowerCase().startsWith(`${root}${sep}`)) return target;
  throw new Error("official safety output must remain inside .local-evaluation");
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main(): Promise<void> {
  const attestation = await measureAndAttestStage02OfficialChordSafety();
  process.stdout.write(`P5.21 Stage 02 official chord safety: clean=${attestation.cleanManifest.fileCount}; output=${stage02OfficialSafetyDirectory}.\n`);
}

if (process.argv.includes("--run-cli")) {
  void main().catch(() => {
    process.stderr.write("P5.21 Stage 02 official chord safety failed: local input validation failed.\n");
    process.exitCode = 1;
  });
}
