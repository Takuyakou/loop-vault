/* global process */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const configFiles = [
  "package.json", "package-lock.json", "node_modules/.package-lock.json", "tsconfig.json", "tsconfig.e2e.json",
  "playwright.config.ts", "vite.config.ts", "vite.config.js",
  "scripts/run-playwright-visual-tests.mjs", "scripts/playwright-web-server.js",
  "scripts/test-dx/selection.mjs", "scripts/test-dx/run.mjs", "scripts/test-dx/cache.mjs", "scripts/test-dx/reporting.mjs",
];

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(root, args, input) {
  const result = spawnSync("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024, input });
  if (result.error || result.status !== 0) throw new Error(`Cannot fingerprint Git state: ${result.stderr?.toString() ?? result.error?.message}`);
  return result.stdout;
}

/**
 * `git hash-object --stdin-paths` for every path in one git process (one sha per line, in path order).
 * One process per file would cost a spawn per file: on a working tree with a large untracked build folder
 * (thousands of files) that is minutes instead of milliseconds.
 */
function hashObjects(root, paths) {
  if (!paths.length) return [];
  const output = git(root, ["hash-object", "--stdin-paths"], `${paths.join("\n")}\n`).toString("utf8").split("\n").filter(Boolean);
  if (output.length !== paths.length) throw new Error(`Cannot fingerprint Git state: hash-object returned ${output.length} lines for ${paths.length} paths`);
  return output;
}

// Only these untracked files can change what a gate observes. Everything else (local build folders, scratch
// output) is neither read nor hashed, so it can neither slow the fingerprint down nor invalidate a PASS.
const untrackedScope = [/^(src|e2e|scripts)\//, /^(package(-lock)?\.json|.*config.*\.[cm]?[jt]s)$/];

export function fingerprint(root) {
  const head = git(root, ["rev-parse", "HEAD"]).toString("utf8").trim();
  // The plain text diff (without --binary) keeps the dirty-state semantics for text edits and reduces a binary edit
  // to one line so it can no longer overflow the spawn buffer (R-01). The one line is the same for every binary
  // content, though, so the contents of the binary-changed files (numstat reports them as `- -`) and of the
  // untracked files a gate can read (see untrackedScope) are hashed here — two different contents of the same
  // file must give two different fingerprints.
  const dirty = createHash("sha256").update(git(root, ["diff", "HEAD"]));
  const numstat = git(root, ["diff", "--numstat", "--no-renames", "-z", "HEAD"]).toString("utf8");
  const binaryChanged = numstat.split("\0").filter((record) => record.startsWith("-\t-\t")).map((record) => record.slice(4));
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"])
    .toString("utf8").split("\0").filter(Boolean).sort();
  const untrackedInScope = untracked.filter((path) => untrackedScope.some((pattern) => pattern.test(path)));
  for (const path of untrackedInScope) {
    if (!resolve(root, path).startsWith(resolve(root) + sep)) throw new Error("Untracked path leaves repository");
  }
  // One `hash-object` call for every file whose contents must count; a file deleted between listing and
  // hashing is reported by path alone.
  const hashable = [...binaryChanged, ...untrackedInScope].filter((path) => existsSync(join(root, path)));
  const hashes = hashObjects(root, hashable);
  const contentHashes = new Map(hashable.map((path, index) => [path, hashes[index]]));
  for (const path of binaryChanged) {
    dirty.update(path);
    if (contentHashes.has(path)) dirty.update(contentHashes.get(path));
  }
  for (const path of untrackedInScope) {
    if (!contentHashes.has(path)) continue;
    dirty.update(path).update(contentHashes.get(path));
  }
  const config = createHash("sha256");
  for (const path of configFiles) {
    const absolute = join(root, path);
    config.update(path);
    config.update(existsSync(absolute) ? readFileSync(absolute) : "missing");
  }
  config.update(process.version).update(process.platform).update(process.arch);
  return { head, dirtyHash: dirty.digest("hex"), configHash: config.digest("hex") };
}

export function cacheKey({ head, dirtyHash, configHash }, gate, selection) {
  return sha256(JSON.stringify({ schemaVersion: 1, head, dirtyHash, configHash, gate, selection }));
}

export function cacheEnabled(level, fresh = false) {
  return level !== "full" && !fresh;
}

export function readPass(cacheRoot, key) {
  const path = join(cacheRoot, `${key}.json`);
  if (!existsSync(path)) return null;
  try {
    const entry = JSON.parse(readFileSync(path, "utf8"));
    return entry.schemaVersion === 1 && entry.key === key && entry.status === "pass" ? entry : null;
  } catch {
    return null;
  }
}

export function writePass(cacheRoot, key, result) {
  if (result.status !== "pass") throw new Error("Only passing gates may enter the cache");
  mkdirSync(cacheRoot, { recursive: true });
  writeFileSync(join(cacheRoot, `${key}.json`), JSON.stringify({
    schemaVersion: 1, key, status: "pass", counts: result.counts,
    seconds: result.seconds, recordedAt: new Date().toISOString(),
  }), "utf8");
}
