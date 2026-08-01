import { access, readFile, readdir, realpath, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { z } from "zod";
import { compareCodePoints, sha256 } from "./corpusContract";

const sha = z.string().regex(/^[a-f0-9]{64}$/);
const holdoutFileSchema = z.object({
  path: z.string().min(1),
  expectedManifestFieldsSha256: sha,
  expectedSha256: sha,
  actualSha256: sha,
  actualByteLength: z.number().int().positive(),
  matchesManifest: z.literal(true),
}).strict();
export const holdoutSchema = z.object({
  phase47FreshHoldout: z.object({
    sourceManifestSha256: sha,
    caseCount: z.number().int().positive(),
    selectionSha256: sha,
    expectedManifestFieldsSha256: sha,
    midiContentSha256: sha,
    files: z.array(holdoutFileSchema).min(1),
    resultOpened: z.literal(false),
  }).strict(),
  phase514RoundTripSubset: z.object({
    selectionSize: z.number().int().positive(),
    selectionSha256: sha,
    exportedMidiSha256: sha,
    exportedMidiByteLength: z.number().int().positive(),
    exporterSourceSha256: sha,
    resultOpened: z.literal(false),
  }).strict(),
  excluded: z.object({
    voicingGoldHoldout: z.literal("burned by prior diagnostics"),
    userRealMidi: z.literal("explicitly excluded"),
  }).strict(),
}).strict();

const invariantGroupsSchema = z.object({
  duplicate: z.array(z.string()),
  ppq: z.array(z.string()),
  velocity: z.array(z.string()),
  trackOrder: z.array(z.string()),
  tempoMap: z.array(z.string()),
}).strict();

export const partitionLockSchema = z.object({
  schemaVersion: z.literal(2),
  phase: z.literal("P5.15-00"),
  policy: z.object({
    frozenBeforeAnalyzerChanges: z.literal(true),
    holdoutResultsVisibleBeforeP51506: z.literal(false),
    thresholdTuningAgainstHoldout: z.literal(false),
  }).strict(),
  development: z.array(z.string()),
  validation: z.array(z.string()),
  roundTrip: z.array(z.string()),
  invariant: invariantGroupsSchema,
  runtime: z.array(z.string()),
  holdout: holdoutSchema,
  finalRealSongSmoke: z.object({
    maximumFiles: z.literal(3),
    selection: z.literal("deferred until all automated gates pass"),
    reusedForTuning: z.literal(false),
  }).strict(),
}).strict();

const fingerprintEntrySchema = z.object({
  path: z.string().min(1),
  sha256: sha,
}).strict();
const frozenBuildArtifactSchema = z.object({
  kind: z.enum(["executable", "msi", "nsis"]),
  path: z.string().min(1),
  sha256: sha,
  byteLength: z.number().int().positive(),
}).strict();
const completeFrozenBuildArtifactsSchema = z.array(frozenBuildArtifactSchema)
  .length(3)
  .superRefine((entries, context) => {
    const kinds = entries.map((entry) => entry.kind).sort();
    if (
      JSON.stringify(kinds)
      !== JSON.stringify(["executable", "msi", "nsis"])
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Build artifact lock requires exactly one executable, MSI, and NSIS.",
      });
    }
  });
const externalSuiteFileSchema = z.object({
  path: z.string().min(1),
  sha256: sha,
  byteLength: z.number().int().positive(),
}).strict();
const externalSuiteSupplementalInputSchema = z.object({
  path: z.string().min(1),
  sha256: sha,
  byteLength: z.number().int().positive(),
  selectionAssociation: z.literal("rows-filtered-to-frozen-midi-selection"),
}).strict();
const externalSuiteSchema = z.object({
  id: z.string().min(1),
  selection: z.string().min(1),
  repositoryLocation: z.string().min(1),
  manifestSha256: sha.nullable(),
  selectionSha256: sha,
  contentSha256: sha,
  fileCount: z.number().int().positive(),
  files: z.array(externalSuiteFileSchema).min(1),
  supplementalInputs: z.array(externalSuiteSupplementalInputSchema).default([]),
}).strict();
const accuracyConditionSchema = z.object({
  id: z.string().min(1),
  analyzerVersion: z.string().min(1),
  canonicalExact: z.number().min(0).max(1),
  usableAccuracy: z.number().min(0).max(1),
  rootAccuracy: z.number().min(0).max(1),
  qualityAccuracy: z.number().min(0).max(1),
  seventhAccuracy: z.number().min(0).max(1),
  tensionAccuracy: z.number().min(0).max(1),
  slashBassAccuracy: z.number().min(0).max(1),
  rank1: z.number().min(0).max(1),
  top3Canonical: z.number().min(0).max(1),
  top3Root: z.number().min(0).max(1),
  candidateRecall: z.number().min(0).max(1),
  unionCandidateRecall: z.number().min(0).max(1),
  candidateCatalogRescueCount: z.number().int(),
  correctionCostTotal: z.number().nonnegative(),
  correctionCostMean: z.number().nonnegative(),
  manualInputRate: z.number().min(0).max(1),
  catalogManualInputRate: z.number().min(0).max(1),
  rank2Or3RescueRate: z.number().min(0).max(1),
  correctionsPerEightEvents: z.number().nonnegative(),
  duplicateCandidates: z.number().int().nonnegative(),
  maxCandidatesPerEvent: z.number().int().nonnegative(),
  deterministic: z.boolean(),
  runtimeMs: z.number().nonnegative(),
  runtimePerFileP50Ms: z.number().nonnegative(),
  runtimePerFileP90Ms: z.number().nonnegative(),
}).strict();
export const existingCorpusBaselinesSchema = z.object({
  schemaVersion: z.literal(1),
  holdoutEvaluated: z.literal(false),
  aliases: z.object({
    phase45Development40: z.literal("voicing-gold-dev"),
    phase5AccuracyFirst: z.string().min(1),
    candidateUnion: z.string().min(1),
  }).strict(),
  corpora: z.array(z.object({
    id: z.string().min(1),
    sourceKind: z.string().min(1),
    caseCount: z.number().int().positive(),
    eventCount: z.number().int().positive(),
    conditions: z.array(accuracyConditionSchema).length(3),
  }).strict()).length(6),
  voicingGold: z.array(z.object({
    split: z.enum(["dev", "validation"]),
    fileCount: z.number().int().positive(),
    eventCount: z.number().int().positive(),
    condition: z.literal("D"),
    policy: z.literal("sourceFaithfulMidi"),
    metrics: z.object({
      events: z.number().int().positive(),
      voicingExactRate: z.number().min(0).max(1),
      notePrecision: z.number().min(0).max(1),
      noteRecall: z.number().min(0).max(1),
      noteF1: z.number().min(0).max(1),
      extraNoteCount: z.number().int().nonnegative(),
      missingNoteCount: z.number().int().nonnegative(),
      bassNoteAccuracy: z.number().min(0).max(1),
      topNoteAccuracy: z.number().min(0).max(1),
      lowestNoteAbsoluteError: z.number().nonnegative(),
      highestNoteAbsoluteError: z.number().nonnegative(),
      registerExactRate: z.number().min(0).max(1),
      octaveErrorRate: z.number().min(0).max(1),
      representationTypeAccuracy: z.number().min(0).max(1),
      simultaneousExactRate: z.number().min(0).max(1),
      aggregateF1: z.number().min(0).max(1).nullable(),
      simultaneousMissRate: z.number().min(0).max(1),
      aggregatedAsSimultaneousRate: z.number().min(0).max(1).nullable(),
      distractorLeakRate: z.number().min(0).max(1),
      melodyLeakRate: z.number().min(0).max(1),
      passingToneLeakRate: z.number().min(0).max(1).nullable(),
      sustainCarryLeakRate: z.number().min(0).max(1).nullable(),
      voiceDuplicateLeakRate: z.number().min(0).max(1).nullable(),
      sourceVoicingUsableRate: z.number().min(0).max(1),
      generatedFallbackRate: z.number().min(0).max(1),
      requiresReviewRate: z.number().min(0).max(1),
      staleAfterChordEditAccuracy: z.number().min(0).max(1),
    }).strict(),
  }).strict()).length(2),
}).strict();

export const baselineLockSchema = z.object({
  schemaVersion: z.literal(2),
  phase: z.literal("P5.15-00"),
  capturedAt: z.literal("2026-07-30"),
  git: z.object({
    baseBranch: z.literal("master"),
    branch: z.literal("docs/p515-00-preflight-baseline"),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    tree: z.string().regex(/^[a-f0-9]{40}$/),
    originMaster: z.string().regex(/^[a-f0-9]{40}$/),
  }).strict(),
  product: z.object({
    defaultAnalyzerMode: z.string().min(1),
    analyzerVersion: z.string().min(1),
    fileVersion: z.number().int().positive(),
    analyzerProductCodeChanged: z.literal(false),
    vaultSchemaChanged: z.literal(false),
    midiExporterChanged: z.literal(false),
    featureFlags: z.object({
      enableExactNoteEvidenceDedup: z.literal(false),
      enableEventLocalTensionEvidence: z.literal(false),
      enableSyncopatedShellBoundary: z.literal(false),
      enableShellSeventhPreference: z.literal(false),
      enableSuspendedQualityDisambiguation: z.literal(false),
      implementedAtBaseline: z.literal(false),
    }).strict(),
  }).strict(),
  roundTripBaseline: z.object({
    timelineEvents: z.number().int().nonnegative(),
    exact: z.number().int().nonnegative(),
    ambiguity: z.number().int().nonnegative(),
  }).strict(),
  sourceFingerprints: z.object({
    packageLockSha256: sha,
    cargoLockSha256: sha,
    corpusContractSha256: sha,
    evaluationContractSha256: sha,
    manifestValidatorSha256: sha,
    contractValidatorSha256: sha,
    evaluatorSelfSha256: sha,
    comparisonPolicySha256: sha,
    holdoutPolicySha256: sha,
    safePathSha256: sha,
    privacyPolicySha256: sha,
    externalSuitePolicySha256: sha,
    vaultSchemaSha256: sha,
    vaultRepositorySha256: sha,
    vaultStoreSha256: sha,
  }).strict(),
  analyzerDependencyGraph: z.array(fingerprintEntrySchema).min(1),
  evaluatorDependencyGraph: z.array(fingerprintEntrySchema).min(1),
  externalSuites: z.array(externalSuiteSchema).min(1),
  existingCorpusBaselines: existingCorpusBaselinesSchema,
  buildArtifacts: z.object({
    productName: z.string().min(1),
    version: z.string().min(1),
    packageVersion: z.string().min(1),
    frozenFingerprints: completeFrozenBuildArtifactsSchema,
  }).strict(),
  privacy: z.object({
    trackedMidi: z.literal(0),
    trackedLocalEvaluation: z.literal(0),
    trackedBuildArtifacts: z.literal(0),
    // Migration default permits the reviewed candidate command to read the
    // pre-split Stage-00 lock once. New candidates always write the real count.
    trackedReviewedArtifactFiles: z.number().int().nonnegative().default(0),
    artifactScanIssueCount: z.literal(0),
  }).strict(),
  preflight: z.object({
    phase514StackIntegrated: z.literal(true),
    phase514FlStudioSmoke: z.literal("PASS (user-confirmed 2026-07-30)"),
    manifestValidation: z.literal("PASS"),
  }).strict(),
  syntheticInventory: z.object({
    caseCount: z.literal(36),
    cases: z.array(z.object({
      id: z.string().min(1),
      midiSha256: sha,
      byteLength: z.number().int().positive(),
    }).strict()).length(36),
  }).strict(),
  holdout: holdoutSchema,
}).strict();

export type PartitionLock = z.infer<typeof partitionLockSchema>;
export type BaselineLock = z.infer<typeof baselineLockSchema>;

export function trackedSafetyCounts(paths: readonly string[]) {
  const normalized = paths.map((path) => path.replaceAll("\\", "/"));
  return {
    trackedMidi: normalized.filter((path) => /\.(?:mid|midi)$/i.test(path)).length,
    trackedLocalEvaluation: normalized.filter((path) =>
      /^\.?local-evaluation(?:\/|$)/i.test(path)).length,
    trackedBuildArtifacts: normalized.filter((path) =>
      /^(?:node_modules|target|src-tauri\/gen|src-tauri\/target[^/]*)(?:\/|$)/i
        .test(path)
      || /^(?:dist|build|out|coverage|playwright-report|test-results|blob-report|\.next)(?:\/|$)/i
        .test(path)).length,
    trackedReviewedArtifactFiles: normalized.filter((path) =>
      /^artifacts(?:\/|$)/i.test(path)).length,
  };
}

export function assertCanonicalLockEqual(
  frozen: unknown,
  expected: unknown,
  schema: z.ZodType,
  label: string,
) {
  const parsedFrozen = schema.safeParse(frozen);
  if (!parsedFrozen.success) {
    throw new Error(`${label} schema mismatch: ${parsedFrozen.error.message}`);
  }
  const parsedExpected = schema.safeParse(expected);
  if (!parsedExpected.success) {
    throw new Error(`${label} recomputation schema mismatch: ${parsedExpected.error.message}`);
  }
  if (stableCanonicalJson(parsedFrozen.data) !== stableCanonicalJson(parsedExpected.data)) {
    throw new Error(`${label} canonical deep comparison mismatch.`);
  }
}

export async function fingerprintDependencyGraph(
  repositoryRoot: string,
  entries: readonly string[],
): Promise<Array<{ path: string; sha256: string }>> {
  const realRoot = await realpath(repositoryRoot);
  const pending = entries.map((entry) => resolve(repositoryRoot, entry));
  const visited = new Set<string>();
  const result: Array<{ path: string; sha256: string }> = [];
  while (pending.length > 0) {
    const absolute = pending.pop()!;
    const actual = await realpath(absolute);
    const fromRoot = relative(realRoot, actual);
    if (!fromRoot || fromRoot.startsWith("..") || visited.has(actual)) continue;
    visited.add(actual);
    const source = await readFile(actual, "utf8");
    result.push({
      path: fromRoot.replaceAll("\\", "/"),
      sha256: sha256(source),
    });
    const imports = source.matchAll(
      /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["'](\.[^"']+)["']/g,
    );
    for (const match of imports) {
      const specifier = match[1]!;
      const base = resolve(dirname(actual), specifier);
      for (const candidate of [
        `${base}.ts`,
        `${base}.tsx`,
        resolve(base, "index.ts"),
        resolve(base, "index.tsx"),
      ]) {
        if (await access(candidate).then(() => true, () => false)) {
          pending.push(candidate);
          break;
        }
      }
    }
  }
  return result.sort((left, right) => compareCodePoints(left.path, right.path));
}

export async function inspectBuildArtifacts(repositoryRoot: string) {
  const tauri = JSON.parse(await readFile(
    resolve(repositoryRoot, "src-tauri/tauri.conf.json"),
    "utf8",
  )) as { productName?: string; version?: string };
  const packageJson = JSON.parse(await readFile(
    resolve(repositoryRoot, "package.json"),
    "utf8",
  )) as { version?: string };
  if (!tauri.productName || !tauri.version || !packageJson.version) {
    throw new Error("Tauri/package product metadata is incomplete.");
  }
  if (tauri.version !== packageJson.version) {
    throw new Error("Tauri and package versions differ.");
  }
  const releaseRoot = resolve(repositoryRoot, "src-tauri/target/release");
  const bundleRoot = resolve(releaseRoot, "bundle");
  const releaseFiles = await readdir(releaseRoot, { withFileTypes: true })
    .catch(() => []);
  const executable = releaseFiles
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".exe")
    .map((entry) => resolve(releaseRoot, entry.name));
  const bundleFiles = await recursiveFiles(bundleRoot);
  const candidates = [
    ...executable.map((path) => ({ kind: "executable" as const, path })),
    ...bundleFiles
      .filter((path) => extname(path).toLowerCase() === ".msi")
      .map((path) => ({ kind: "msi" as const, path })),
    ...bundleFiles
      .filter((path) =>
        extname(path).toLowerCase() === ".exe"
        && relative(bundleRoot, path).replaceAll("\\", "/").startsWith("nsis/"))
      .map((path) => ({ kind: "nsis" as const, path })),
  ];
  const current = [];
  for (const kind of ["executable", "msi", "nsis"] as const) {
    const matching = candidates
      .filter((item) => item.kind === kind)
      .sort((left, right) => compareCodePoints(left.path, right.path));
    if (matching.length > 1) {
      throw new Error(
        `Build artifact discovery found multiple ${kind} candidates: ${
          matching.map((item) =>
            relative(repositoryRoot, item.path).replaceAll("\\", "/")).join(", ")
        }.`,
      );
    }
    const selected = matching[0];
    if (!selected) {
      current.push({
        kind,
        path: null,
        exists: false,
        status: "SKIPPED" as const,
        sha256: null,
        byteLength: null,
      });
      continue;
    }
    const bytes = new Uint8Array(await readFile(selected.path));
    current.push({
      kind,
      path: relative(repositoryRoot, selected.path).replaceAll("\\", "/"),
      exists: true,
      status: "PRESENT" as const,
      sha256: sha256(bytes),
      byteLength: (await stat(selected.path)).size,
    });
  }
  return {
    productName: tauri.productName,
    version: tauri.version,
    packageVersion: packageJson.version,
    current,
  };
}

async function recursiveFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const result: string[] = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) result.push(...await recursiveFiles(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}

export function stableCanonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item)
        .sort(([left], [right]) => compareCodePoints(left, right))
        .map(([key, child]) => [key, normalize(child)]));
    }
    return item;
  };
  return JSON.stringify(normalize(value));
}
