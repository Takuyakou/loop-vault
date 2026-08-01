import { createHash } from "node:crypto";
import { dirname, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { findPrivacyIssues } from "./privacy";
import { readFileExistingWithinRoot } from "./safePath";

export const STAGE01_BASELINE_LOCK_SHA256 =
  "3f126e3ab04dedbd46c2bb859992877875c20378df6e2ca79deb48b55a277633" as const;
export const STAGE01_DATA_INVENTORY_SHA256 =
  "1cdeb5078a5b10f0466951a474279b523b06fe7170abcddbcba651058108360d" as const;
export const STAGE01_PARTITION_LOCK_SHA256 =
  "66bf45e8afd412d11f71ebe7b221d3d2121a7ad71a8c8bf20c793b163d9a0adb" as const;
export const STAGE01_RUNTIME_BASELINE_SHA256 =
  "38256b5bfac5e244264f497ed7250842c7d33c39973f3e280a486dc6edf0aa46" as const;
export const STAGE01_BASELINE_REPOSITORY_COMMIT =
  "2eb36b63a064c4ee44e0d071836b2d722f534502" as const;
export const STAGE01_ANALYZER_CONFIG_SHA256 =
  "881d0784d051251179fb47afbfb7c0a79586ec7bebaf59405464f9913eeb837d" as const;
export const STAGE01_SAFE_CORPUS_LOGICAL_ENTRY_COUNT = 317 as const;
export const STAGE01_SAFE_CORPUS_UNIQUE_PHYSICAL_FILE_COUNT = 277 as const;
export const STAGE01_VOICING_SELECTION_SUITE_ID =
  "voicing-gold-40-file-selection" as const;
export const STAGE01_VOICING_DEVELOPMENT_SUITE_ID =
  "voicing-gold-development" as const;
export const STAGE01_VOICING_SELECTION_DEVELOPMENT_OVERLAP_COUNT = 40 as const;
export const STAGE01_NORMALIZED_CORPUS_MANIFEST_SHA256 =
  "8e97f2f9a16546d9f3b2ad6a8dcff76f8fff40b8df8a063a28b1dc2456b78eb6" as const;
export const STAGE01_EXCLUDED_CORPUS_SUITE =
  "voicing-gold-burned-holdout-diagnostic-only" as const;

const shaSchema = z.string().regex(/^[a-f0-9]{64}$/);
const relativePathSchema = z.string().min(1).superRefine((value, context) => {
  if (
    /^[a-z]:[\\/]/i.test(value)
    || value.startsWith("/")
    || value.startsWith("\\")
    || value.split(/[\\/]/).includes("..")
    || value.includes("\\")
  ) {
    context.addIssue({ code: "custom", message: "Corpus path is not a normalized repository-relative path." });
  }
});

const lockedFileSchema = z.object({
  relativePath: relativePathSchema,
  byteLength: z.number().int().nonnegative(),
  sha256: shaSchema,
}).strict();

const lockedSuiteSchema = z.object({
  id: z.string().min(1),
  manifestPath: relativePathSchema,
  files: z.array(lockedFileSchema).min(1),
}).strict();

const lockedCrossSuiteOverlapSchema = z.object({
  suiteIds: z.tuple([
    z.literal(STAGE01_VOICING_SELECTION_SUITE_ID),
    z.literal(STAGE01_VOICING_DEVELOPMENT_SUITE_ID),
  ]),
  files: z.array(lockedFileSchema)
    .length(STAGE01_VOICING_SELECTION_DEVELOPMENT_OVERLAP_COUNT),
}).strict();

const featureFlagStateSchema = z.object({
  enableExactNoteEvidenceDedup: z.literal(false),
  enableEventLocalTensionEvidence: z.literal(false),
  enableSyncopatedShellBoundary: z.literal(false),
  enableShellSeventhPreference: z.literal(false),
  enableSuspendedQualityDisambiguation: z.literal(false),
  implementedAtBaseline: z.literal(false),
}).strict();

export const stage01CorpusLockBindingSchema = z.object({
  schemaVersion: z.literal(2),
  phase: z.literal("P5.15-01"),
  purpose: z.literal("bind-the-frozen-stage00-safe-corpus-without-analyzer-recomputation"),
  sourceLocks: z.object({
    baselineLockSha256: z.literal(STAGE01_BASELINE_LOCK_SHA256),
    dataInventorySha256: z.literal(STAGE01_DATA_INVENTORY_SHA256),
    partitionLockSha256: z.literal(STAGE01_PARTITION_LOCK_SHA256),
    runtimeBaselineSha256: z.literal(STAGE01_RUNTIME_BASELINE_SHA256),
  }).strict(),
  baseline: z.object({
    repositoryCommit: z.literal(STAGE01_BASELINE_REPOSITORY_COMMIT),
    analyzerConfigSha256: z.literal(STAGE01_ANALYZER_CONFIG_SHA256),
    featureFlagState: featureFlagStateSchema,
    partitionLockSha256: z.literal(STAGE01_PARTITION_LOCK_SHA256),
  }).strict(),
  normalizedManifest: z.object({
    logicalEntryCount: z.literal(STAGE01_SAFE_CORPUS_LOGICAL_ENTRY_COUNT),
    uniquePhysicalFileCount: z.literal(STAGE01_SAFE_CORPUS_UNIQUE_PHYSICAL_FILE_COUNT),
    suites: z.array(lockedSuiteSchema).min(1),
    allowedCrossSuiteOverlaps: z.tuple([lockedCrossSuiteOverlapSchema]),
    sha256: z.literal(STAGE01_NORMALIZED_CORPUS_MANIFEST_SHA256),
  }).strict(),
  privacy: z.object({
    repositoryRelativePathsOnly: z.literal(true),
    absolutePathsIncluded: z.literal(false),
    personalNamesIncluded: z.literal(false),
    midiBytesIncluded: z.literal(false),
  }).strict(),
}).strict().superRefine((value, context) => {
  const entries = value.normalizedManifest.suites.flatMap((suite) =>
    suite.files.map((file) => ({ suiteId: suite.id, ...file })));
  if (entries.length !== STAGE01_SAFE_CORPUS_LOGICAL_ENTRY_COUNT) {
    context.addIssue({ code: "custom", message: "Corpus binding does not contain exactly 317 logical entries." });
  }
  if (new Set(entries.map((entry) => `${entry.suiteId}\0${entry.relativePath}`)).size !== entries.length) {
    context.addIssue({ code: "custom", message: "Corpus binding contains duplicate suite/path entries." });
  }
  const physicalPaths = new Map<string, typeof entries>();
  for (const entry of entries) {
    const group = physicalPaths.get(entry.relativePath) ?? [];
    group.push(entry);
    physicalPaths.set(entry.relativePath, group);
  }
  if (physicalPaths.size !== STAGE01_SAFE_CORPUS_UNIQUE_PHYSICAL_FILE_COUNT) {
    context.addIssue({
      code: "custom",
      message: "Corpus binding does not contain exactly 277 unique physical files.",
    });
  }

  const declaredOverlap = value.normalizedManifest.allowedCrossSuiteOverlaps[0];
  const declaredFiles = new Map(declaredOverlap.files.map((file) => [file.relativePath, file]));
  if (declaredFiles.size !== declaredOverlap.files.length) {
    context.addIssue({ code: "custom", message: "Declared cross-suite overlap contains duplicate paths." });
  }
  for (const [path, group] of physicalPaths) {
    if (group.length === 1) continue;
    const suiteIds = group.map((entry) => entry.suiteId).sort();
    const expectedSuiteIds = [...declaredOverlap.suiteIds].sort();
    const first = group[0]!;
    const exactDeclaredFile = declaredFiles.get(path);
    if (group.length !== 2
      || stableJson(suiteIds) !== stableJson(expectedSuiteIds)
      || group.some((entry) => entry.byteLength !== first.byteLength || entry.sha256 !== first.sha256)
      || !exactDeclaredFile
      || exactDeclaredFile.byteLength !== first.byteLength
      || exactDeclaredFile.sha256 !== first.sha256) {
      context.addIssue({
        code: "custom",
        message: `Undeclared or non-identical cross-suite duplicate: ${path}.`,
      });
    }
  }
  for (const file of declaredOverlap.files) {
    if (physicalPaths.get(file.relativePath)?.length !== 2) {
      context.addIssue({
        code: "custom",
        message: `Declared cross-suite overlap is not duplicated exactly twice: ${file.relativePath}.`,
      });
    }
  }

  const manifest = {
    logicalEntryCount: value.normalizedManifest.logicalEntryCount,
    uniquePhysicalFileCount: value.normalizedManifest.uniquePhysicalFileCount,
    suites: value.normalizedManifest.suites,
    allowedCrossSuiteOverlaps: value.normalizedManifest.allowedCrossSuiteOverlaps,
  };
  if (sha256(stableJson(manifest)) !== value.normalizedManifest.sha256) {
    context.addIssue({ code: "custom", message: "Normalized corpus manifest SHA-256 is invalid." });
  }
  if (findPrivacyIssues(value, "01-corpus-lock-binding.json").length > 0) {
    context.addIssue({ code: "custom", message: "Corpus binding contains privacy-sensitive data." });
  }
});

export type Stage01CorpusLockBinding = z.infer<typeof stage01CorpusLockBindingSchema>;

interface SourceLocks {
  baseline: Buffer;
  inventory: Buffer;
  partition: Buffer;
  runtime: Buffer;
}

export interface Stage01BaselineLock {
  git: { commit: string };
  product: {
    featureFlags: Stage01CorpusLockBinding["baseline"]["featureFlagState"];
  };
  externalSuites: Array<{
    id: string;
    repositoryLocation: string;
    files: Array<{ path: string; byteLength: number; sha256: string }>;
  }>;
}

export interface Stage01RuntimeBaseline {
  analyzer: { mode: string; version: string };
  threeMinute: {
    runtimeMs: { median: number; p95: number; max: number };
    maxObservedPostAnalysisRssBytes: number;
  };
  fortyFileBatch: { status: "COMPLETED"; requested: 40; completed: 40; totalMs: number };
}
interface DataInventory {
  externalSuiteVerification: Array<{
    id: string;
    frozenFingerprint: {
      fileCount: number;
      files: Array<{ path: string; byteLength: number; sha256: string }>;
    };
  }>;
}

/** Read every Stage 00 source lock exactly once through an identity-checked handle. */
async function captureSourceLocks(repositoryRoot: string): Promise<SourceLocks> {
  const paths = [
    "docs/phase5.15/00-baseline-lock.json",
    "docs/phase5.15/00-data-inventory.json",
    "docs/phase5.15/00-partition-lock.json",
    "docs/phase5.15/00-runtime-baseline.json",
  ] as const;
  const [baseline, inventory, partition, runtime] = await Promise.all(
    paths.map((path) => readFileExistingWithinRoot(repositoryRoot, path)),
  );
  return { baseline, inventory, partition, runtime };
}

function parseJson<T>(bytes: Buffer, name: string): T {
  try {
    return JSON.parse(bytes.toString("utf8")) as T;
  } catch (cause) {
    throw new Error(`Invalid frozen ${name} JSON.`, { cause });
  }
}

export async function buildStage01CorpusLockBinding(
  repositoryRoot: string,
): Promise<Stage01CorpusLockBinding> {
  return (await loadStage01CorpusLockSource(repositoryRoot)).binding;
}

async function loadStage01CorpusLockSource(repositoryRoot: string): Promise<{
  binding: Stage01CorpusLockBinding;
  baselineLock: Stage01BaselineLock;
  runtimeBaseline: Stage01RuntimeBaseline;
}> {
  const source = await captureSourceLocks(repositoryRoot);
  const hashes = {
    baselineLockSha256: stage01SourceLockSha256(source.baseline),
    dataInventorySha256: stage01SourceLockSha256(source.inventory),
    partitionLockSha256: stage01SourceLockSha256(source.partition),
    runtimeBaselineSha256: stage01SourceLockSha256(source.runtime),
  };
  const expectedHashes = {
    baselineLockSha256: STAGE01_BASELINE_LOCK_SHA256,
    dataInventorySha256: STAGE01_DATA_INVENTORY_SHA256,
    partitionLockSha256: STAGE01_PARTITION_LOCK_SHA256,
    runtimeBaselineSha256: STAGE01_RUNTIME_BASELINE_SHA256,
  };
  if (stableJson(hashes) !== stableJson(expectedHashes)) {
    throw new Error(`Stage 00 source lock SHA-256 mismatch: ${JSON.stringify(hashes)}`);
  }

  const baseline = parseJson<Stage01BaselineLock>(source.baseline, "baseline lock");
  const inventory = parseJson<DataInventory>(source.inventory, "data inventory");
  const runtime = parseJson<Stage01RuntimeBaseline>(source.runtime, "runtime baseline");
  if (baseline.git.commit !== STAGE01_BASELINE_REPOSITORY_COMMIT) {
    throw new Error("Stage 00 baseline repository commit changed.");
  }
  if (sha256(stableJson(runtime.analyzer)) !== STAGE01_ANALYZER_CONFIG_SHA256) {
    throw new Error("Stage 00 analyzer config hash changed.");
  }

  const sourceSuites = baseline.externalSuites.filter(
    (suite) => suite.id !== STAGE01_EXCLUDED_CORPUS_SUITE,
  );
  const inventoryById = new Map(inventory.externalSuiteVerification.map((suite) => [suite.id, suite]));
  const suites = sourceSuites.map((suite) => {
    const inventorySuite = inventoryById.get(suite.id);
    if (!inventorySuite
      || inventorySuite.frozenFingerprint.fileCount !== suite.files.length
      || stableJson(inventorySuite.frozenFingerprint.files) !== stableJson(suite.files)) {
      throw new Error(`Stage 00 data inventory differs from baseline lock: ${suite.id}.`);
    }
    return {
      id: suite.id,
      manifestPath: normalizeRepositoryPath(suite.repositoryLocation),
      files: suite.files.map((file) => ({
        relativePath: lockedRepositoryRelativePath(suite.repositoryLocation, file.path),
        byteLength: file.byteLength,
        sha256: file.sha256,
      })),
    };
  });
  const selectionSuite = suites.find((suite) => suite.id === STAGE01_VOICING_SELECTION_SUITE_ID);
  const developmentSuite = suites.find((suite) => suite.id === STAGE01_VOICING_DEVELOPMENT_SUITE_ID);
  if (!selectionSuite || !developmentSuite) {
    throw new Error("Stage 00 Voicing40 overlap suites are missing.");
  }
  const developmentPaths = new Set(developmentSuite.files.map((file) => file.relativePath));
  const allowedCrossSuiteOverlaps = [{
    suiteIds: [
      STAGE01_VOICING_SELECTION_SUITE_ID,
      STAGE01_VOICING_DEVELOPMENT_SUITE_ID,
    ] as const,
    files: selectionSuite.files.filter((file) => developmentPaths.has(file.relativePath)),
  }] as const;
  const logicalEntryCount = suites.reduce((count, suite) => count + suite.files.length, 0);
  const uniquePhysicalFileCount = new Set(
    suites.flatMap((suite) => suite.files.map((file) => file.relativePath)),
  ).size;
  const manifest = {
    logicalEntryCount,
    uniquePhysicalFileCount,
    suites,
    allowedCrossSuiteOverlaps,
  };
  const normalizedManifestSha256 = sha256(stableJson(manifest));
  if (normalizedManifestSha256 !== STAGE01_NORMALIZED_CORPUS_MANIFEST_SHA256) {
    throw new Error(`Stage 01 normalized corpus manifest SHA-256 changed: ${normalizedManifestSha256}.`);
  }
  const binding = stage01CorpusLockBindingSchema.parse({
    schemaVersion: 2,
    phase: "P5.15-01",
    purpose: "bind-the-frozen-stage00-safe-corpus-without-analyzer-recomputation",
    sourceLocks: hashes,
    baseline: {
      repositoryCommit: baseline.git.commit,
      analyzerConfigSha256: sha256(stableJson(runtime.analyzer)),
      featureFlagState: baseline.product.featureFlags,
      partitionLockSha256: hashes.partitionLockSha256,
    },
    normalizedManifest: {
      logicalEntryCount,
      uniquePhysicalFileCount,
      suites,
      allowedCrossSuiteOverlaps,
      sha256: normalizedManifestSha256,
    },
    privacy: {
      repositoryRelativePathsOnly: true,
      absolutePathsIncluded: false,
      personalNamesIncluded: false,
      midiBytesIncluded: false,
    },
  });
  return { binding, baselineLock: baseline, runtimeBaseline: runtime };
}

export interface CorpusLockVerification {
  pass: true;
  logicalEntryCount: 317;
  uniquePhysicalFileCount: 277;
  normalizedManifestSha256: string;
  binding: Stage01CorpusLockBinding;
  baselineLock: Stage01BaselineLock;
  runtimeBaseline: Stage01RuntimeBaseline;
}

/** Verify frozen lock metadata and file bytes only. This function never calls Analyzer. */
export async function verifyStage01CorpusLock(
  repositoryRoot: string,
): Promise<CorpusLockVerification> {
  const source = await loadStage01CorpusLockSource(repositoryRoot);
  const expected = source.binding;
  const bindingBytes = await readFileExistingWithinRoot(
    repositoryRoot,
    "docs/phase5.15/01-corpus-lock-binding.json",
  );
  const actual = stage01CorpusLockBindingSchema.parse(
    parseJson<unknown>(bindingBytes, "Stage 01 corpus binding"),
  );
  if (stableJson(actual) !== stableJson(expected)) {
    throw new Error("Tracked Stage 01 corpus binding differs from the frozen Stage 00 selection.");
  }

  const differences: Array<{ suite: string; path: string; issue: string }> = [];
  for (const suite of actual.normalizedManifest.suites) {
    for (const file of suite.files) {
      try {
        const bytes = await readFileExistingWithinRoot(repositoryRoot, file.relativePath);
        if (bytes.byteLength !== file.byteLength) {
          differences.push({ suite: suite.id, path: file.relativePath, issue: "byte-length-mismatch" });
        } else if (sha256(bytes) !== file.sha256) {
          differences.push({ suite: suite.id, path: file.relativePath, issue: "sha256-mismatch" });
        }
      } catch (cause) {
        differences.push({
          suite: suite.id,
          path: file.relativePath,
          issue: (cause as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "safe-read-failed",
        });
      }
    }
  }
  if (differences.length > 0) {
    throw new Error(`Stage 01 corpus lock mismatch: ${JSON.stringify(differences)}`);
  }
  return {
    pass: true,
    logicalEntryCount: STAGE01_SAFE_CORPUS_LOGICAL_ENTRY_COUNT,
    uniquePhysicalFileCount: STAGE01_SAFE_CORPUS_UNIQUE_PHYSICAL_FILE_COUNT,
    normalizedManifestSha256: actual.normalizedManifest.sha256,
    binding: actual,
    baselineLock: source.baselineLock,
    runtimeBaseline: source.runtimeBaseline,
  };
}

export function renderStage01CorpusLockBinding(binding: Stage01CorpusLockBinding): string {
  return `${JSON.stringify(binding, null, 2)}\n`;
}

function lockedRepositoryRelativePath(repositoryLocation: string, filePath: string): string {
  const candidate = filePath.startsWith(".local-evaluation/")
    ? filePath
    : `${dirname(repositoryLocation).replaceAll("\\", "/")}/${filePath}`;
  return normalizeRepositoryPath(candidate);
}

function normalizeRepositoryPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  const lexical = resolve("C:/repository-root", normalized);
  const fromRoot = relative("C:/repository-root", lexical).split(sep).join("/");
  if (!fromRoot || fromRoot.startsWith("../") || /^[a-z]:/i.test(fromRoot)) {
    throw new Error(`Unsafe frozen repository-relative path: ${path}.`);
  }
  return fromRoot;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Stage 00 lock JSON is text metadata, and Git may materialize its line endings
 * as LF or CRLF without changing the tracked content.  Bind its canonical UTF-8
 * text so a fresh Windows checkout verifies the same lock.  Corpus MIDI bytes
 * continue to use the raw-byte SHA-256 path above.
 */
export function stage01SourceLockSha256(value: Uint8Array): string {
  if (value.length >= 3 && value[0] === 0xef && value[1] === 0xbb && value[2] === 0xbf) {
    throw new Error("Stage 00 source lock is not canonical UTF-8 JSON text.");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch (cause) {
    throw new Error("Stage 00 source lock is not canonical UTF-8 JSON text.", { cause });
  }
  return sha256(text.replace(/\r\n?/gu, "\n"));
}
