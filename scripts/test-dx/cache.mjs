/* global process */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const configFiles = [
  "package.json", "package-lock.json", "node_modules/.package-lock.json", "tsconfig.json", "tsconfig.e2e.json",
  "playwright.config.ts", "vite.config.ts", "vite.config.js",
  "scripts/run-playwright-visual-tests.mjs", "scripts/playwright-web-server.js",
  "scripts/test-dx/selection.mjs", "scripts/test-dx/run.mjs", "scripts/test-dx/cache.mjs",
];

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Cannot fingerprint Git state: ${result.stderr?.toString() ?? result.error?.message}`);
  return result.stdout;
}

export function fingerprint(root) {
  const head = git(root, ["rev-parse", "HEAD"]).toString("utf8").trim();
  const dirty = createHash("sha256").update(git(root, ["diff", "--binary", "HEAD"]));
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"])
    .toString("utf8").split("\0").filter(Boolean).sort();
  for (const path of untracked) {
    if (!/^(src|e2e|scripts)\//.test(path) && !/^(package(-lock)?\.json|.*config.*\.[cm]?[jt]s)$/.test(path)) continue;
    const absolute = resolve(root, path);
    if (!absolute.startsWith(resolve(root) + sep)) throw new Error("Untracked path leaves repository");
    dirty.update(path).update(readFileSync(absolute));
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
