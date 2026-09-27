import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { cacheEnabled, cacheKey, readPass, writePass } from "./cache.mjs";

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
  const folder = join(".local-evaluation", "test-dx", "cache-test-evidence");
  const key = cacheKey(state, "TypeScript", []);
  assert.throws(() => writePass(folder, key, { status: "fail" }), /Only passing/);
  writePass(folder, key, { status: "pass", counts: "4/4", seconds: 1.2 });
  assert.equal(readPass(folder, key)?.counts, "4/4");
  assert.equal(readPass(folder, "missing"), null);
});
