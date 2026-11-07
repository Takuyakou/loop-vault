import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { cacheEnabled, cacheKey, fingerprint, readPass, writePass } from "./cache.mjs";

const state = { head: "abc", dirtyHash: "clean", configHash: "v1" };

test("same HEAD, dirty state, config and selection yields same key", () => {
  const first = cacheKey(state, "Vitest selected", ["src/a.test.ts"]);
  assert.equal(first, cacheKey(state, "Vitest selected", ["src/a.test.ts"]));
});

test("head, tracked diff, config, gate and selection each invalidate", () => {
  const original = cacheKey(state, "Vitest selected", ["src/a.test.ts"]);
  for (const changed of [
    cacheKey({ ...state, head: "def" }, "Vitest selected", ["src/a.test.ts"]),
    cacheKey({ ...state, dirtyHash: "edited" }, "Vitest selected", ["src/a.test.ts"]),
    cacheKey({ ...state, configHash: "v2" }, "Vitest selected", ["src/a.test.ts"]),
    cacheKey(state, "Playwright selected", ["src/a.test.ts"]),
    cacheKey(state, "Vitest selected", ["src/b.test.ts"]),
  ]) assert.notEqual(changed, original);
});

test("FULL never reads a cached PASS", () => {
  assert.equal(cacheEnabled("full"), false);
  assert.equal(cacheEnabled("fast"), true);
  assert.equal(cacheEnabled("feature", true), false);
});

test("only PASS is stored; corrupt or non-PASS entries are ignored", () => {
  const folder = join(".local-evaluation", "test-performance", "cache-test-evidence");
  const key = cacheKey(state, "TypeScript", []);
  assert.throws(() => writePass(folder, key, { status: "fail" }), /Only passing/);
  writePass(folder, key, { status: "pass", counts: "4/4", seconds: 1.2 });
  assert.equal(readPass(folder, key)?.counts, "4/4");
  assert.equal(readPass(folder, "missing"), null);
});

/** A throwaway git repository: one tracked binary, committed once, then edited in two different ways. */
function binaryEvidenceRepo() {
  const root = join(".local-evaluation", "test-performance", "cache-fingerprint-evidence");
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const run = (args) => {
    const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: root, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`fixture git ${args.join(" ")} failed: ${result.stderr}`);
    return result.stdout;
  };
  run(["init"]);
  writeFileSync(join(root, "cover.png"), Buffer.from([0x89, 0x50, ...Array.from({ length: 64 }, (_, i) => i)]));
  run(["add", "cover.png"]);
  run(["commit", "-m", "fixture"]);
  return root;
}

const paint = (byte) => Buffer.from([0x89, 0x50, ...Array.from({ length: 64 }, (_, i) => (i + byte) % 251)]);

test("fingerprint: the same tracked binary changed in two different ways gives two different dirty hashes", () => {
  const root = binaryEvidenceRepo();
  const { dirtyHash: clean } = fingerprint(root);
  writeFileSync(join(root, "cover.png"), paint(1));
  const { dirtyHash: one } = fingerprint(root);
  writeFileSync(join(root, "cover.png"), paint(2));
  const { dirtyHash: two } = fingerprint(root);
  assert.notEqual(one, two, "different binary contents must not share a fingerprint");
  assert.notEqual(one, clean);
});

test("fingerprint: an untracked source file with two different contents gives two different dirty hashes", () => {
  const root = binaryEvidenceRepo();
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "notes.txt"), "a");
  const { dirtyHash: one } = fingerprint(root);
  writeFileSync(join(root, "src", "notes.txt"), "b");
  const { dirtyHash: two } = fingerprint(root);
  assert.notEqual(one, two);
});

test("fingerprint: an untracked file outside src/, e2e/, scripts/ and the config names neither enters nor invalidates it", () => {
  const root = binaryEvidenceRepo();
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "notes.txt"), "a");
  const { dirtyHash: before } = fingerprint(root);
  mkdirSync(join(root, ".cargo-target-local", "debug"), { recursive: true });
  writeFileSync(join(root, ".cargo-target-local", "debug", "artifact"), "1");
  const { dirtyHash: withLocalBuild } = fingerprint(root);
  assert.equal(withLocalBuild, before, "a local build folder must not enter the fingerprint");
  writeFileSync(join(root, ".cargo-target-local", "debug", "artifact"), "2");
  const { dirtyHash: changedLocalBuild } = fingerprint(root);
  assert.equal(changedLocalBuild, before, "editing it must not invalidate a PASS either");
  writeFileSync(join(root, "src", "notes.txt"), "b");
  assert.notEqual(fingerprint(root).dirtyHash, before, "an in-scope untracked edit still changes it");
});
