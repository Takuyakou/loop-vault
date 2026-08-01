import { constants } from "node:fs";
import {
  lstat,
  open,
  realpath,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";

/**
 * Resolve an untrusted manifest path while proving that it remains below root.
 * The root itself is not a valid file target.
 */
export function safeResolveWithinRoot(root: string, untrustedPath: string): string {
  if (!untrustedPath || isAbsolute(untrustedPath)) {
    throw new Error(`Unsafe path: ${untrustedPath || "<empty>"}`);
  }
  const absoluteRoot = resolve(root);
  const candidate = resolve(absoluteRoot, untrustedPath);
  const fromRoot = relative(absoluteRoot, candidate);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error(`Path escapes root: ${untrustedPath}`);
  }
  return candidate;
}

/**
 * Resolve an existing read target and prove containment again after following
 * symlinks/junctions/reparse points. Callers must use this for untrusted paths
 * immediately before a filesystem read.
 */
export async function safeResolveExistingWithinRoot(
  root: string,
  untrustedPath: string,
): Promise<string> {
  await assertRealDirectory(root, "Safe read root");
  const lexical = safeResolveWithinRoot(root, untrustedPath);
  const [realRoot, realCandidate] = await Promise.all([
    realpath(resolve(root)),
    realpath(lexical),
  ]);
  const fromRoot = relative(realRoot, realCandidate);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error(`Real path escapes root: ${untrustedPath}`);
  }
  return realCandidate;
}

/**
 * Prove that an evaluator corpus root is both lexically and physically inside
 * the repository and that neither root nor any corpus-root component is a
 * symlink/junction. This check deliberately rejects a corpus root which is
 * itself a reparse point even when it happens to resolve back into the repo.
 */
export async function assertRealCorpusRootWithinRepository(
  repositoryRoot: string,
  corpusRoot: string,
): Promise<string> {
  const lexicalRepositoryRoot = resolve(repositoryRoot);
  const lexicalCorpusRoot = resolve(corpusRoot);
  await assertRealDirectory(lexicalRepositoryRoot, "Repository root");
  const lexicalRelative = relative(lexicalRepositoryRoot, lexicalCorpusRoot);
  if (
    !lexicalRelative
    || lexicalRelative.startsWith("..")
    || isAbsolute(lexicalRelative)
  ) {
    throw new Error("Evaluation corpus root must remain inside the repository.");
  }
  let cursor = lexicalRepositoryRoot;
  for (const component of lexicalRelative.split(/[\\/]/)) {
    cursor = resolve(cursor, component);
    await assertRealDirectory(cursor, "Evaluation corpus root");
  }
  const [realRepositoryRoot, realCorpusRoot] = await Promise.all([
    realpath(lexicalRepositoryRoot),
    realpath(lexicalCorpusRoot),
  ]);
  const realRelative = relative(realRepositoryRoot, realCorpusRoot);
  if (
    !realRelative
    || realRelative.startsWith("..")
    || isAbsolute(realRelative)
  ) {
    throw new Error("Evaluation corpus root resolves outside the repository.");
  }
  return realCorpusRoot;
}

/**
 * Read an untrusted existing file without a path-check/read gap. Every lexical
 * component must be a real directory (never a symlink/junction), the opened
 * handle must still name the checked file, and containment is checked again
 * after the bytes have been read. Any concurrent namespace change fails
 * closed and the caller must discard the returned operation.
 */
export async function readFileExistingWithinRoot(
  root: string,
  untrustedPath: string,
  options: {
    /** Test/diagnostic hook used to exercise namespace swaps after open(). */
    afterHandleOpen?: () => void | Promise<void>;
  } = {},
): Promise<Buffer> {
  const absoluteRoot = resolve(root);
  const lexical = safeResolveWithinRoot(absoluteRoot, untrustedPath);
  await assertRealPathComponents(absoluteRoot, lexical);
  const noFollow = "O_NOFOLLOW" in constants
    ? constants.O_NOFOLLOW
    : 0;
  const handle = await open(lexical, constants.O_RDONLY | noFollow);
  try {
    const before = await handle.stat();
    if (!before.isFile()) {
      throw new Error(`Safe read target is not a regular file: ${untrustedPath}`);
    }
    await options.afterHandleOpen?.();
    const checked = await safeResolveExistingWithinRoot(
      absoluteRoot,
      untrustedPath,
    );
    const lexicalInfo = await lstat(lexical);
    if (
      lexicalInfo.isSymbolicLink()
      || lexicalInfo.dev !== before.dev
      || lexicalInfo.ino !== before.ino
    ) {
      throw new Error(`Safe read target identity changed: ${untrustedPath}`);
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    await assertRealPathComponents(absoluteRoot, lexical);
    const finalPath = await safeResolveExistingWithinRoot(
      absoluteRoot,
      untrustedPath,
    );
    const finalInfo = await lstat(lexical);
    if (
      checked !== finalPath
      || finalInfo.isSymbolicLink()
      || finalInfo.dev !== before.dev
      || finalInfo.ino !== before.ino
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
    ) {
      throw new Error(`Safe read target changed during read: ${untrustedPath}`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function assertRealPathComponents(
  root: string,
  target: string,
): Promise<void> {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("Safe read root must be a real directory.");
  }
  const pathFromRoot = relative(root, target);
  let cursor = root;
  for (const component of pathFromRoot.split(/[\\/]/)) {
    cursor = resolve(cursor, component);
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) {
      throw new Error(`Safe read path contains a symlink or junction: ${component}`);
    }
    if (cursor !== target && !info.isDirectory()) {
      throw new Error(`Safe read ancestor is not a directory: ${component}`);
    }
  }
  if (dirname(target) === target) {
    throw new Error("Safe read target cannot be a filesystem root.");
  }
}

async function assertRealDirectory(path: string, label: string): Promise<void> {
  const info = await lstat(resolve(path));
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory, not a symlink or junction.`);
  }
}
