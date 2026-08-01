import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { argv, cwd, stdout } from "node:process";
import {
  renderContractMidi,
} from "./corpusContract";
import { loadPhase515CorpusContract } from "./validateCorpusContract";
import { safeResolveWithinRoot } from "./safePath";
import { findPrivacyIssues } from "./privacy";

export async function generatePhase515Corpus(
  repositoryRoot: string,
  manifestPath = resolve(cwd(), "scripts/phase515/fixtures/manifest-v2.json"),
  options: {
    beforePromotion?: () => void | Promise<void>;
  } = {},
) {
  const contract = await loadPhase515CorpusContract(manifestPath);
  const outputRoot = resolve(repositoryRoot);
  await assertSafeNewOutputRoot(outputRoot);
  const releaseTargetLock = await acquireTargetParentLock(outputRoot);
  try {
    return await generateWithTargetLock(outputRoot, contract, options);
  } finally {
    await releaseTargetLock();
  }
}

async function generateWithTargetLock(
  outputRoot: string,
  contract: Awaited<ReturnType<typeof loadPhase515CorpusContract>>,
  options: {
    beforePromotion?: () => void | Promise<void>;
  },
) {
  await assertSafeNewOutputRoot(outputRoot);
  const baseRoot = safeResolveWithinRoot(outputRoot, "test/phase5.15");
  const supplementalRoot = safeResolveWithinRoot(
    outputRoot,
    "test/phase5.15-supplemental",
  );
  const baseCases = contract.cases
    .filter((item) => item.sourceManifest === "base-v1")
    .map((item) => item.sourceRecipe);
  const supplementalCases = contract.cases
    .filter((item) => item.sourceManifest === "supplemental-v1")
    .map((item) => item.sourceRecipe);
  const manifests = [
    {
      path: safeResolveWithinRoot(baseRoot, "manifest.json"),
      value: {
        name: "Loop Vault Phase 5.15 Regression Corpus",
        version: 1,
        generated_at: "2026-07-30",
        source_context: "Synthetic corpus reconstructed from the tracked semantic v2 contract.",
        usage: {
          recommended_local_path: "test/phase5.15/",
          do_not_commit_personal_midi: true,
          comparison_note: "Generated compatibility recipe; v2 remains authoritative.",
        },
        cases: baseCases,
      },
    },
    {
      path: safeResolveWithinRoot(supplementalRoot, "manifest-supplemental.json"),
      value: {
        name: "Loop Vault Phase 5.15 Supplemental Corpus",
        version: 1,
        generated_at: "2026-07-30",
        purpose: "Coverage reconstructed from the tracked semantic v2 contract.",
        comparison_groups: {
          ppq_invariance: [...contract.invariantGroups.ppq],
          velocity_invariance: [...contract.invariantGroups.velocity],
          track_order_invariance: [...contract.invariantGroups.trackOrder],
        },
        cases: supplementalCases,
      },
    },
  ];
  const planned = [
    ...manifests.map((manifest) => ({
      relativePath: relative(outputRoot, manifest.path),
      contents: `${JSON.stringify(manifest.value, null, 2)}\n`,
      privacyValue: manifest.value,
    })),
    ...contract.cases.map((item) => {
      const group = item.sourceManifest === "base-v1"
        ? "test/phase5.15/midi"
        : "test/phase5.15-supplemental/midi";
      return {
        relativePath: `${group}/${item.filename}`,
        contents: renderContractMidi(item),
        privacyValue: {
          id: item.id,
          relativePath: `${group}/${item.filename}`,
        },
      };
    }),
  ];
  const privacyIssues = planned.flatMap((item) =>
    findPrivacyIssues(item.privacyValue, `generated.${item.relativePath}`));
  if (privacyIssues.length > 0) {
    throw new Error(
      `Generated corpus privacy scan failed before write: ${JSON.stringify(privacyIssues)}`,
    );
  }

  const parent = dirname(outputRoot);
  const stagingRoot = await mkdtemp(resolve(parent, ".loop-vault-p515-stage-"));
  try {
    for (const item of planned) {
      const path = safeResolveWithinRoot(stagingRoot, item.relativePath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, item.contents);
    }
    await options.beforePromotion?.();
    await assertSafeNewOutputRoot(outputRoot);
    // The complete tree has one namespace promotion point. On Windows (the
    // supported release platform) directory rename fails if *any* destination
    // already exists. A non-cooperating writer therefore wins or loses the
    // final name atomically; none of our staged files can leak into its tree.
    await rename(stagingRoot, outputRoot);
  } catch (cause) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw cause;
  }
  return contract.cases.map((item) => ({
    id: item.id,
    path: `${
      item.sourceManifest === "base-v1"
        ? "test/phase5.15/midi"
        : "test/phase5.15-supplemental/midi"
    }/${item.filename}`,
    byteLength: item.midi.byteLength,
  }));
}

async function acquireTargetParentLock(
  outputRoot: string,
): Promise<() => Promise<void>> {
  const parent = dirname(outputRoot);
  const lockKey = createHash("sha256")
    .update(resolve(outputRoot))
    .digest("hex")
    .slice(0, 24);
  const lockPath = resolve(parent, `.loop-vault-p515-generate-${lockKey}.lock`);
  const owner = {
    schemaVersion: 1,
    pid: process.pid,
    nonce: randomUUID(),
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await writeFile(lockPath, `${JSON.stringify(owner)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      break;
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "EEXIST") throw cause;
      const observed = await readGeneratorLock(lockPath);
      if (isProcessAlive(observed.pid)) {
        throw new Error(
          "Corpus generation for this destination is already in progress.",
          { cause },
        );
      }
      const snapshot = resolve(
        parent,
        `.loop-vault-p515-generate-stale-${randomUUID()}`,
      );
      try {
        await rename(lockPath, snapshot);
      } catch (captureCause) {
        if ((captureCause as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw captureCause;
      }
      try {
        const captured = await readGeneratorLock(snapshot);
        if (
          captured.pid !== observed.pid
          || captured.nonce !== observed.nonce
          || isProcessAlive(captured.pid)
        ) {
          await restoreCapturedGeneratorLock(snapshot, lockPath);
          await rm(snapshot);
          continue;
        }
        await rm(snapshot);
      } finally {
        // A failed restore retains the unique captured inode for diagnosis.
      }
    }
  }
  if (!await lstat(lockPath).then(
    (info) => info.isFile() && !info.isSymbolicLink(),
    () => false,
  )) {
    throw new Error("Unable to acquire the corpus destination lock.");
  }
  const acquired = await readGeneratorLock(lockPath);
  if (acquired.pid !== owner.pid || acquired.nonce !== owner.nonce) {
    throw new Error("Corpus destination lock ownership changed.");
  }
  const created = await lstat(lockPath);
  return async () => {
    const releasePath = resolve(
      parent,
      `.loop-vault-p515-generate-release-${randomUUID()}`,
    );
    try {
      await rename(lockPath, releasePath);
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return;
      throw cause;
    }
    const info = await lstat(releasePath);
    if (
      !info.isFile()
      || info.isSymbolicLink()
      || info.dev !== created.dev
      || info.ino !== created.ino
    ) {
      await restoreCapturedGeneratorLock(releasePath, lockPath);
      await rm(releasePath);
      throw new Error("Corpus destination lock ownership changed during release.");
    }
    await rm(releasePath);
  };
}

async function readGeneratorLock(path: string) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error("Malformed corpus destination lock.");
  }
  const value = JSON.parse(await readFile(path, "utf8")) as {
    schemaVersion?: number;
    pid?: number;
    nonce?: string;
  };
  if (
    value.schemaVersion !== 1
    || !Number.isInteger(value.pid)
    || (value.pid ?? 0) <= 0
    || typeof value.nonce !== "string"
    || !/^[a-f0-9-]{16,}$/i.test(value.nonce)
  ) {
    throw new Error("Malformed corpus destination lock.");
  }
  return value as { schemaVersion: 1; pid: number; nonce: string };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function restoreCapturedGeneratorLock(
  capturedPath: string,
  lockPath: string,
): Promise<void> {
  try {
    await link(capturedPath, lockPath);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Corpus destination lock changed during atomic capture.", {
        cause,
      });
    }
    throw cause;
  }
}

const outputFlag = argv.indexOf("--output");
if (outputFlag >= 0) {
  const outputDirectory = argv[outputFlag + 1];
  if (!outputDirectory) throw new Error("--output requires a directory.");
  const generated = await generatePhase515Corpus(resolve(outputDirectory));
  stdout.write(`Generated ${generated.length} MIDI files.\n`);
} else if (argv.includes("--temporary")) {
  const temporaryParent = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-cli-"));
  const temporaryRoot = resolve(temporaryParent, "generated");
  try {
    const generated = await generatePhase515Corpus(temporaryRoot);
    stdout.write(`Generated and verified ${generated.length} MIDI files in an isolated temporary directory.\n`);
  } finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
}

async function assertSafeNewOutputRoot(outputRoot: string): Promise<void> {
  const parent = dirname(outputRoot);
  const parentInfo = await lstat(parent);
  if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink()) {
    throw new Error("Output parent must be an existing real directory.");
  }
  const realParent = await realpath(parent);
  if (relative(resolve(parent), realParent) !== "") {
    throw new Error("Output parent path cannot traverse a symlink or junction.");
  }
  const candidateFromParent = relative(
    realParent,
    resolve(realParent, basename(outputRoot)),
  );
  if (
    !candidateFromParent
    || candidateFromParent.startsWith("..")
    || isAbsolute(candidateFromParent)
  ) {
    throw new Error("Output path escapes its real parent.");
  }
  const info = await lstat(outputRoot).catch((cause: NodeJS.ErrnoException) => {
    if (cause.code === "ENOENT") return undefined;
    throw cause;
  });
  if (info) {
    throw new Error("Refusing to write into any existing output target.");
  }
}
