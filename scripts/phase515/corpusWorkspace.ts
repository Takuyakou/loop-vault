import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { Phase515CorpusContract } from "./corpusContract";
import { generatePhase515Corpus } from "./generateCorpus";
import { validateManifestFile } from "./manifestValidation";
import {
  assertRealCorpusRootWithinRepository,
  readFileExistingWithinRoot,
} from "./safePath";
import {
  validateCorpusContract,
  validateGeneratedCorpusContractInMemory,
  validateSourceContractDrift,
} from "./validateCorpusContract";

export interface CorpusWorkspaceValidation {
  source: "generated-temp" | "generated-in-memory" | "local-ignored";
  root: string;
  valid: boolean;
  contract: Awaited<ReturnType<typeof validateCorpusContract>>;
  sourceRecipes: Array<Awaited<ReturnType<typeof validateManifestFile>>["result"]>;
  driftIssues: Awaited<ReturnType<typeof validateSourceContractDrift>>;
}

export async function corpusWorkspaceExists(repositoryRoot: string): Promise<boolean> {
  const required = [
    ["test/phase5.15", "manifest.json"],
    ["test/phase5.15-supplemental", "manifest-supplemental.json"],
  ];
  const present = await Promise.all(required.map(async ([root, manifest]) => {
    const corpusRoot = resolve(repositoryRoot, root!);
    try {
      await assertRealCorpusRootWithinRepository(repositoryRoot, corpusRoot);
      await readFileExistingWithinRoot(corpusRoot, manifest!);
      return true;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw cause;
    }
  }));
  if (present.some(Boolean) && !present.every(Boolean)) {
    throw new Error("Local Phase 5.15 corpus is incomplete; both v1 manifests are required.");
  }
  return present.every(Boolean);
}

export async function validateCorpusWorkspace(
  repositoryRoot: string,
  contract: Phase515CorpusContract,
  source: CorpusWorkspaceValidation["source"],
): Promise<CorpusWorkspaceValidation> {
  const sourceRecipes = await Promise.all([
    validateManifestFile(
      resolve(repositoryRoot, "test/phase5.15/manifest.json"),
      resolve(repositoryRoot, "test/phase5.15/midi"),
    ),
    validateManifestFile(
      resolve(repositoryRoot, "test/phase5.15-supplemental/manifest-supplemental.json"),
      resolve(repositoryRoot, "test/phase5.15-supplemental/midi"),
    ),
  ]);
  const validation = await validateCorpusContract(repositoryRoot, contract);
  const driftIssues = await validateSourceContractDrift(repositoryRoot, contract);
  return {
    source,
    root: source,
    valid:
      validation.valid
      && sourceRecipes.every((item) => item.result.valid)
      && driftIssues.length === 0,
    contract: validation,
    sourceRecipes: sourceRecipes.map((item) => item.result),
    driftIssues,
  };
}

export async function validateCorpusWorkspaceReadOnly(
  repositoryRoot: string,
  contract: Phase515CorpusContract,
): Promise<CorpusWorkspaceValidation> {
  await Promise.all([
    assertRealCorpusRootWithinRepository(
      repositoryRoot,
      resolve(repositoryRoot, "test/phase5.15"),
    ),
    assertRealCorpusRootWithinRepository(
      repositoryRoot,
      resolve(repositoryRoot, "test/phase5.15-supplemental"),
    ),
  ]);
  const sourceRecipes = await Promise.all([
    validateManifestFile(
      resolve(repositoryRoot, "test/phase5.15/manifest.json"),
      resolve(repositoryRoot, "test/phase5.15/midi"),
    ),
    validateManifestFile(
      resolve(repositoryRoot, "test/phase5.15-supplemental/manifest-supplemental.json"),
      resolve(repositoryRoot, "test/phase5.15-supplemental/midi"),
    ),
  ]);
  const validation = await validateCorpusContract(repositoryRoot, contract);
  return {
    source: "local-ignored",
    root: "local-ignored",
    valid:
      validation.valid
      && sourceRecipes.every((item) => item.result.valid),
    contract: validation,
    sourceRecipes: sourceRecipes.map((item) => item.result),
    // The tracked in-memory regeneration below is the authoritative drift
    // proof for the default no-write path.
    driftIssues: [],
  };
}

export function validateGeneratedCorpusReadOnly(
  contract: Phase515CorpusContract,
): CorpusWorkspaceValidation {
  const validation = validateGeneratedCorpusContractInMemory(contract);
  return {
    source: "generated-in-memory",
    root: "generated-in-memory",
    valid: validation.valid,
    contract: validation,
    sourceRecipes: [],
    driftIssues: [],
  };
}

export async function withGeneratedCorpus<T>(
  contract: Phase515CorpusContract,
  task: (temporaryRepositoryRoot: string) => Promise<T>,
): Promise<T> {
  const temporaryParent = await mkdtemp(
    resolve(tmpdir(), "loop-vault-p515-workspace-"),
  );
  const temporaryRoot = resolve(temporaryParent, "generated");
  try {
    await generatePhase515Corpus(temporaryRoot);
    return await task(temporaryRoot);
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
}

export async function validateGeneratedCorpus(
  contract: Phase515CorpusContract,
): Promise<CorpusWorkspaceValidation> {
  return withGeneratedCorpus(contract, (temporaryRoot) =>
    validateCorpusWorkspace(temporaryRoot, contract, "generated-temp"));
}
