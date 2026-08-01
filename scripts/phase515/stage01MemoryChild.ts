import { readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { argv, stdout } from "node:process";
import { relative, resolve } from "node:path";
import { analyzeMidi } from "../../src/domain/midi/analysis";
import type { AnalyzeMidiOptions } from "../../src/domain/midi/types";
import type { MidiProgressionAnalysis } from "../../src/domain/types";
import { isStrictStage01NoteEvidenceDedupDiagnostics } from "./stage01ReportSchema";
import {
  renderContractMidi,
  type Phase515CorpusContract,
} from "./corpusContract";
import { readFileExistingWithinRoot } from "./safePath";

const enabled = argv.includes("--enabled");
const root = resolve(import.meta.dirname, "../..");
const artifactRootIndex = argv.indexOf("--artifact-root");
const artifactAuditRoot = artifactRootIndex >= 0 ? argv[artifactRootIndex + 1] : undefined;
if (!artifactAuditRoot) throw new Error("Missing dedicated artifact audit root.");
assertDedicatedArtifactRoot(artifactAuditRoot);
const beforeArtifacts = snapshotArtifactState(root, artifactAuditRoot);
const contract = JSON.parse((await readFileExistingWithinRoot(
  root,
  "scripts/phase515/fixtures/manifest-v2.json",
)).toString("utf8")) as Phase515CorpusContract;
const item = contract.cases.find((candidate) =>
  candidate.id === "36_long_three_minute_stability");
if (!item) throw new Error("Missing fixed three-minute runtime case.");
const bytes = renderContractMidi(item);
const options: AnalyzeMidiOptions = {
  mode: "phase4-v1" as const,
};
const warmupIterations = 6;
const measuredIterations = 24;
const gc = (globalThis as { gc?: () => void }).gc;
if (!gc) throw new Error("Explicit GC is required for the Stage 01 memory protocol.");

collectGarbage(gc);
const coldBefore = memoryPoint();
const warmupPeaks: MemoryPoint[] = [];
for (let index = 0; index < warmupIterations; index += 1) {
  analyzeWithStage01Capability(bytes, options, enabled);
  warmupPeaks.push(memoryPoint());
  collectGarbage(gc);
}
const postWarmupGc = memoryPoint();
const warmupRetainedGrowth = subtractPoint(postWarmupGc, coldBefore);
const before = postWarmupGc;
const peak = { ...before };
const postGcSeries = [before];
for (let index = 0; index < measuredIterations; index += 1) {
  analyzeWithStage01Capability(bytes, options, enabled);
  updatePeak(peak, memoryPoint());
  collectGarbage(gc);
  postGcSeries.push(memoryPoint());
}
const postGc = postGcSeries.at(-1)!;

const afterArtifacts = snapshotArtifactState(root, artifactAuditRoot);
stdout.write(`${JSON.stringify({
  enabled,
  warmupIterations,
  measuredIterations,
  gcExposed: true,
  coldBefore,
  warmupPeaks,
  postWarmupGc,
  warmupRetainedGrowth,
  before,
  peak,
  postGc,
  retainedGrowth: {
    rssBytes: postGc.rssBytes - before.rssBytes,
    heapUsedBytes: postGc.heapUsedBytes - before.heapUsedBytes,
    externalBytes: postGc.externalBytes - before.externalBytes,
  },
  retainedSlopeBytesPerIteration: {
    rssBytes: linearSlope(postGcSeries.map((item) => item.rssBytes)),
    heapUsedBytes: linearSlope(postGcSeries.map((item) => item.heapUsedBytes)),
    externalBytes: linearSlope(postGcSeries.map((item) => item.externalBytes)),
  },
  postGcSeries,
  temporaryArtifactsCreated: countCreated(beforeArtifacts, afterArtifacts),
})}\n`);

interface MemoryPoint {
  rssBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
}

interface Stage01AnalyzerOptionsCapability {
  phase515: { enableExactNoteEvidenceDedup: boolean };
}

function analyzeWithStage01Capability(
  bytes: Uint8Array,
  options: AnalyzeMidiOptions,
  featureEnabled: boolean,
): MidiProgressionAnalysis {
  const extendedOptions: AnalyzeMidiOptions & Stage01AnalyzerOptionsCapability = {
    ...options,
    phase515: { enableExactNoteEvidenceDedup: featureEnabled },
  };
  const result = analyzeMidi(bytes, extendedOptions);
  if (featureEnabled && !hasStrictStage01Diagnostics(result)) {
    throw new Error("Stage 01 exact-note evidence capability unavailable.");
  }
  return result;
}

function hasStrictStage01Diagnostics(value: unknown): boolean {
  if (!isUnknownRecord(value) || !("noteEvidenceDedup" in value)) return false;
  const diagnostics = value.noteEvidenceDedup;
  return isStrictStage01NoteEvidenceDedupDiagnostics(diagnostics);
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


function collectGarbage(gc: () => void): void {
  gc();
  gc();
}

function memoryPoint(): MemoryPoint {
  const usage = process.memoryUsage();
  return {
    rssBytes: usage.rss,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
  };
}

function updatePeak(peak: MemoryPoint, value: MemoryPoint): void {
  peak.rssBytes = Math.max(peak.rssBytes, value.rssBytes);
  peak.heapUsedBytes = Math.max(peak.heapUsedBytes, value.heapUsedBytes);
  peak.externalBytes = Math.max(peak.externalBytes, value.externalBytes);
}

function subtractPoint(left: MemoryPoint, right: MemoryPoint): MemoryPoint {
  return {
    rssBytes: left.rssBytes - right.rssBytes,
    heapUsedBytes: left.heapUsedBytes - right.heapUsedBytes,
    externalBytes: left.externalBytes - right.externalBytes,
  };
}

function linearSlope(values: readonly number[]): number {
  const count = values.length;
  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / count;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) {
    const deltaX = index - meanX;
    numerator += deltaX * (values[index]! - meanY);
    denominator += deltaX * deltaX;
  }
  return Math.round(numerator / denominator);
}

/**
 * The child snapshots its parent-created temporary audit directory plus every
 * repository location this benchmark could reasonably use as an output. Only
 * opaque counts leave the child, so paths cannot leak into the parent report.
 */
function snapshotArtifactState(
  repositoryRoot: string,
  dedicatedArtifactRoot: string,
): ReadonlySet<string> {
  const outputRoots = [
    resolve(repositoryRoot, "docs/phase5.15"),
    resolve(repositoryRoot, "dist"),
    resolve(repositoryRoot, "target"),
    resolve(repositoryRoot, "src-tauri/target"),
    resolve(repositoryRoot, "playwright-report"),
    resolve(repositoryRoot, "test-results"),
    resolve(repositoryRoot, "blob-report"),
    resolve(repositoryRoot, "node_modules/.vite"),
  ];
  const entries = new Set<string>();
  snapshotRoot(dedicatedArtifactRoot, true, "temp", entries);
  outputRoots.forEach((path, index) => snapshotRoot(path, true, `output-${index}`, entries));
  return entries;
}

function assertDedicatedArtifactRoot(path: string): void {
  const relativePath = relative(tmpdir(), path);
  if (relativePath.startsWith("..")
    || resolve(tmpdir(), relativePath) !== resolve(path)
    || !relativePath.startsWith("loop-vault-p51501-")) {
    throw new Error("Artifact audit root is outside the dedicated temporary namespace.");
  }
}

function snapshotRoot(
  rootPath: string,
  recursive: boolean,
  namespace: string,
  entries: Set<string>,
): void {
  let children;
  try {
    children = readdirSync(rootPath, { withFileTypes: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return;
    throw cause;
  }
  for (const child of children) {
    const path = resolve(rootPath, child.name);
    const key = `${namespace}:${relative(rootPath, path).replaceAll("\\", "/")}`;
    let isDirectory: boolean;
    try {
      const stat = statSync(path);
      isDirectory = stat.isDirectory();
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (["EACCES", "EPERM"].includes((cause as NodeJS.ErrnoException).code ?? "")) {
        entries.add(`${key}:inaccessible`);
        continue;
      }
      throw cause;
    }
    entries.add(`${key}:${isDirectory ? "d" : "f"}`);
    if (recursive && isDirectory) {
      const nested = new Set<string>();
      snapshotRoot(path, true, key, nested);
      nested.forEach((item) => entries.add(item));
    }
  }
}

function countCreated(before: ReadonlySet<string>, after: ReadonlySet<string>): number {
  let count = 0;
  for (const item of after) if (!before.has(item)) count += 1;
  return count;
}
