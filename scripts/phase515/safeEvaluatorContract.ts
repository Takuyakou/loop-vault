import { createHash } from "node:crypto";
import { basename, dirname, relative, resolve } from "node:path";
import type { BaselineLock } from "./lockContract";
import { baselineLockSchema } from "./lockContract";
import {
  assertRealCorpusRootWithinRepository,
  readFileExistingWithinRoot,
  safeResolveWithinRoot,
} from "./safePath";

export type SafeEvaluatorFile = {
  fileId: string;
  path: string;
  split: string;
};

export type FrozenSafeEvaluatorSuite =
  BaselineLock["externalSuites"][number];

export interface FrozenSafeEvaluatorContract {
  lockSha256: string;
  suites: ReadonlyMap<string, FrozenSafeEvaluatorSuite>;
}

export interface CapturedFrozenBaselineLock {
  bytes: Buffer;
  lock: BaselineLock;
  sha256: string;
}

const FROZEN_CONTRACT_PATH = "docs/phase5.15/00-baseline-lock.json";
const SAFE_SUITE_IDS = new Set([
  "chord-drip-100",
  "chapter3",
  "voicing-gold-development",
  "voicing-gold-validation",
  "phase4.7-development",
  "phase4.7-validation",
]);

/**
 * Load the exact reviewed lock named by the parent process. Safe evaluator
 * modes deliberately have no fallback which discovers or selects a corpus on
 * their own: the fixed lock path and its parent-supplied digest are mandatory.
 */
export async function loadFrozenSafeEvaluatorContract(
  repositoryRoot: string,
  args: readonly string[],
): Promise<FrozenSafeEvaluatorContract> {
  const contractPath = requiredOption(args, "--p515-frozen-contract");
  const expectedSha256 = requiredOption(
    args,
    "--p515-frozen-contract-sha256",
  );
  if (normalizePath(contractPath) !== FROZEN_CONTRACT_PATH) {
    throw new Error(
      `Safe evaluator requires the fixed frozen contract ${FROZEN_CONTRACT_PATH}.`,
    );
  }
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error("Safe evaluator frozen contract SHA-256 is invalid.");
  }
  const captured = await captureFrozenBaselineLock(repositoryRoot, {
    expectedSha256,
  });
  const actualSha256 = captured.sha256;
  const lock = captured.lock;
  const suites = new Map<string, FrozenSafeEvaluatorSuite>();
  for (const suite of lock.externalSuites) {
    if (suites.has(suite.id)) {
      throw new Error(`Frozen evaluator contract duplicates suite ${suite.id}.`);
    }
    suites.set(suite.id, suite);
  }
  for (const id of SAFE_SUITE_IDS) {
    if (!suites.has(id)) {
      throw new Error(`Frozen evaluator contract is missing suite ${id}.`);
    }
  }
  return { lockSha256: actualSha256, suites };
}

/**
 * Capture the parent lock once through an identity-checked handle. The exact
 * returned bytes are the sole input to both SHA-256 and JSON/schema parsing.
 */
export async function captureFrozenBaselineLock(
  repositoryRoot: string,
  options: {
    afterHandleOpen?: () => void | Promise<void>;
    expectedSha256?: string;
  } = {},
): Promise<CapturedFrozenBaselineLock> {
  const bytes = await readFileExistingWithinRoot(
    repositoryRoot,
    FROZEN_CONTRACT_PATH,
    options,
  );
  const actualSha256 = sha256(bytes);
  if (
    options.expectedSha256 !== undefined
    && actualSha256 !== options.expectedSha256
  ) {
    throw new Error("Safe evaluator frozen contract hash mismatch.");
  }
  return {
    bytes,
    sha256: actualSha256,
    lock: baselineLockSchema.parse(JSON.parse(bytes.toString("utf8"))),
  };
}

export function frozenSafeEvaluatorArgs(lockSha256: string): string[] {
  if (!/^[a-f0-9]{64}$/.test(lockSha256)) {
    throw new Error("Safe evaluator frozen contract SHA-256 is invalid.");
  }
  return [
    "--p515-frozen-contract",
    FROZEN_CONTRACT_PATH,
    "--p515-frozen-contract-sha256",
    lockSha256,
  ];
}

export function frozenSuite(
  contract: FrozenSafeEvaluatorContract,
  id: string,
): FrozenSafeEvaluatorSuite {
  if (!SAFE_SUITE_IDS.has(id)) {
    throw new Error(`Safe evaluator forbids unreviewed suite ${id}.`);
  }
  const suite = contract.suites.get(id);
  if (!suite) {
    throw new Error(`Frozen evaluator contract is missing suite ${id}.`);
  }
  return suite;
}

export async function readFrozenSuiteManifest(
  repositoryRoot: string,
  corpusRoot: string,
  suite: FrozenSafeEvaluatorSuite,
): Promise<Buffer> {
  await assertFrozenCorpusRoot(repositoryRoot, corpusRoot, suite);
  if (!suite.manifestSha256) {
    throw new Error(`Frozen suite ${suite.id} has no manifest hash.`);
  }
  const bytes = await readFileExistingWithinRoot(corpusRoot, "manifest.json");
  if (sha256(bytes) !== suite.manifestSha256) {
    throw new Error(`Frozen suite manifest hash mismatch: ${suite.id}.`);
  }
  return bytes;
}

/**
 * Capture one reviewed MIDI through a checked file handle and validate the
 * bytes returned by that same handle before a caller can pass them to Analyzer.
 */
export async function readFrozenSuiteMidi(
  repositoryRoot: string,
  corpusRoot: string,
  suite: FrozenSafeEvaluatorSuite,
  corpusRelativePath: string,
  options: {
    afterHandleOpen?: () => void | Promise<void>;
  } = {},
): Promise<Buffer> {
  await assertFrozenCorpusRoot(repositoryRoot, corpusRoot, suite);
  const matches = suite.files.filter((file) =>
    normalizePath(file.path) === normalizePath(corpusRelativePath));
  if (matches.length !== 1) {
    throw new Error(
      `MIDI is not in the unique frozen selection: ${suite.id}/${corpusRelativePath}.`,
    );
  }
  const expected = matches[0]!;
  const bytes = await readFileExistingWithinRoot(
    corpusRoot,
    corpusRelativePath,
    options,
  );
  if (
    bytes.byteLength !== expected.byteLength
    || sha256(bytes) !== expected.sha256
  ) {
    throw new Error(
      `Frozen MIDI content mismatch before Analyzer: ${suite.id}/${corpusRelativePath}.`,
    );
  }
  return bytes;
}

/** Read and verify a non-MIDI input associated with this frozen selection. */
export async function readFrozenSuiteSupplementalInput(
  repositoryRoot: string,
  corpusRoot: string,
  suite: FrozenSafeEvaluatorSuite,
  corpusRelativePath: string,
  options: {
    afterHandleOpen?: () => void | Promise<void>;
  } = {},
): Promise<Buffer> {
  await assertFrozenCorpusRoot(repositoryRoot, corpusRoot, suite);
  const matches = suite.supplementalInputs.filter((input) =>
    normalizePath(input.path) === normalizePath(corpusRelativePath));
  if (matches.length !== 1) {
    throw new Error(
      `Supplemental input is not uniquely frozen for selection: ${suite.id}/${corpusRelativePath}.`,
    );
  }
  const expected = matches[0]!;
  if (expected.selectionAssociation !== "rows-filtered-to-frozen-midi-selection") {
    throw new Error(`Unsupported supplemental-input association: ${suite.id}.`);
  }
  const bytes = await readFileExistingWithinRoot(
    corpusRoot,
    corpusRelativePath,
    options,
  );
  if (
    bytes.byteLength !== expected.byteLength
    || sha256(bytes) !== expected.sha256
  ) {
    throw new Error(
      `Frozen supplemental input content mismatch before parse: ${suite.id}/${corpusRelativePath}.`,
    );
  }
  return bytes;
}

export function selectFrozenDefinitions<T>(
  suite: FrozenSafeEvaluatorSuite,
  definitions: readonly T[],
  pathOf: (definition: T) => string,
): T[] {
  if (suite.fileCount !== suite.files.length) {
    throw new Error(`Frozen suite file count mismatch: ${suite.id}.`);
  }
  const byPath = new Map<string, T>();
  for (const definition of definitions) {
    const path = normalizePath(pathOf(definition));
    if (byPath.has(path)) {
      throw new Error(`Evaluator manifest duplicates MIDI path: ${suite.id}/${path}.`);
    }
    byPath.set(path, definition);
  }
  const selected = suite.files.map((file) => {
    const definition = byPath.get(normalizePath(file.path));
    if (!definition) {
      throw new Error(
        `Frozen evaluator selection is absent from manifest: ${suite.id}/${file.path}.`,
      );
    }
    return definition;
  });
  if (selected.length !== definitions.length) {
    throw new Error(
      `Evaluator manifest contains rows outside the frozen selection: ${suite.id}.`,
    );
  }
  return selected;
}

const PHASE47_COUNTS = {
  dev: 12,
  validation: 12,
  holdout: 12,
} as const;

const VOICING_COUNTS = {
  dev: 40,
  validation: 10,
  holdout: 10,
} as const;

/**
 * Validate the complete public Phase 4.7 manifest before selecting a safe
 * non-Holdout partition. This proves that a renamed/repartitioned Holdout row
 * cannot be smuggled into dev/validation by changing only one manifest field.
 */
export function assertPhase47SafeManifest(
  corpusRoot: string,
  files: readonly SafeEvaluatorFile[],
): void {
  assertExactPartition(files, PHASE47_COUNTS, "Phase 4.7");
  for (const file of files) {
    if (!file.fileId.startsWith(`${file.split}-`)) {
      throw new Error(
        `Phase 4.7 fileId/split mismatch: ${file.fileId}/${file.split}.`,
      );
    }
    assertSplitPath(corpusRoot, file, "Phase 4.7");
    const stem = basename(file.path, ".mid");
    if (stem !== file.fileId && !stem.startsWith(`${file.fileId}_`)) {
      throw new Error(
        `Phase 4.7 fileId/MIDI filename mismatch: ${file.fileId}/${file.path}.`,
      );
    }
  }
}

/**
 * Validate the complete Voicing Gold partition and prove every selected MIDI
 * path is lexically contained in its declared split directory.
 */
export function assertVoicingGoldSafeManifest(
  corpusRoot: string,
  files: readonly SafeEvaluatorFile[],
): void {
  assertExactPartition(files, VOICING_COUNTS, "Voicing Gold");
  for (const file of files) {
    assertSplitPath(corpusRoot, file, "Voicing Gold");
  }
}

function assertExactPartition(
  files: readonly SafeEvaluatorFile[],
  expected: Readonly<Record<"dev" | "validation" | "holdout", number>>,
  label: string,
): void {
  const expectedTotal = Object.values(expected)
    .reduce((sum, count) => sum + count, 0);
  if (files.length !== expectedTotal) {
    throw new Error(`${label} manifest must contain exactly ${expectedTotal} files.`);
  }
  const fileIds = new Set<string>();
  const paths = new Set<string>();
  const counts = new Map<string, number>();
  for (const file of files) {
    if (
      !file
      || typeof file.fileId !== "string"
      || !file.fileId
      || typeof file.path !== "string"
      || !file.path
      || typeof file.split !== "string"
      || !(file.split in expected)
    ) {
      throw new Error(`${label} manifest contains an invalid file row.`);
    }
    if (fileIds.has(file.fileId) || paths.has(file.path)) {
      throw new Error(`${label} manifest contains duplicate fileId/path rows.`);
    }
    fileIds.add(file.fileId);
    paths.add(file.path);
    counts.set(file.split, (counts.get(file.split) ?? 0) + 1);
  }
  for (const [split, count] of Object.entries(expected)) {
    if (counts.get(split) !== count) {
      throw new Error(
        `${label} ${split} partition must contain exactly ${count} files.`,
      );
    }
  }
}

function assertSplitPath(
  corpusRoot: string,
  file: SafeEvaluatorFile,
  label: string,
): void {
  safeResolveWithinRoot(corpusRoot, file.path);
  const normalized = file.path.replaceAll("\\", "/");
  if (
    !normalized.startsWith(`midi/${file.split}/`)
    || !/\.mid$/i.test(normalized)
  ) {
    throw new Error(
      `${label} split/MIDI path mismatch: ${file.fileId}/${file.path}.`,
    );
  }
}

async function assertFrozenCorpusRoot(
  repositoryRoot: string,
  corpusRoot: string,
  suite: FrozenSafeEvaluatorSuite,
): Promise<void> {
  await assertRealCorpusRootWithinRepository(repositoryRoot, corpusRoot);
  const repositoryRelativeRoot = normalizePath(relative(
    resolve(repositoryRoot),
    resolve(corpusRoot),
  ));
  const lockedRoot = normalizePath(dirname(suite.repositoryLocation));
  const allowedRoots = suite.id === "chapter3"
    ? new Set([
      lockedRoot,
      ".local-evaluation/chapter3-seed",
      "test/loop-vault-chapter3-seed",
    ])
    : new Set([lockedRoot]);
  if (!allowedRoots.has(repositoryRelativeRoot)) {
    throw new Error(`Corpus root differs from frozen suite path: ${suite.id}.`);
  }
}

function requiredOption(args: readonly string[], name: string): string {
  const indexes = args.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length !== 1) {
    throw new Error(`Safe evaluator requires exactly one ${name} option.`);
  }
  const value = args[indexes[0]! + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Safe evaluator option ${name} requires a value.`);
  }
  return value;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
