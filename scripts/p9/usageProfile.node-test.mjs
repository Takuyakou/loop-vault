import { test } from "node:test";
import assert from "node:assert/strict";
import { generateUsageCorpus } from "./usageProfile.mjs";
import { generateUsageCorpusV2 } from "./usageProfileV2.mjs";
import { generateMetamorphicInventory, metamorphicVariants } from "./metamorphic.mjs";

test("usage profile deterministic and covers independent scenario families", () => {
  const first = generateUsageCorpus(), second = generateUsageCorpus();
  assert.deepEqual(first, second);
  assert.equal(first.cases.length, 20);
  assert.deepEqual([...new Set(first.cases.map((item) => item.family))].sort(), ["clean", "instrument", "metadata", "temporal", "transcription"]);
  for (const item of first.cases) {
    assert.ok(item.notes.every((note) => note.pitch >= 0 && note.pitch <= 127 && note.durationTick > 0));
    assert.ok(item.gold.every((event) => event.endTick > event.startTick));
  }
});
test("metamorphic variants are deterministic and preserve declared invariants", () => {
  const source = generateUsageCorpus().cases[0];
  const variants = metamorphicVariants(source);
  assert.equal(variants.length, 8);
  assert.equal(generateMetamorphicInventory().variants.length, 208);
  assert.deepEqual(generateMetamorphicInventory(), generateMetamorphicInventory());
  const original = source.notes.map((item) => item.pitch);
  assert.deepEqual(variants[0].source.notes.map((item) => item.pitch), original.map((pitch) => pitch + 2));
  for (const id of ["tempo-136", "velocity-minus-12", "meter-representation-one-quarter", "track-split", "track-merge"]) {
    const changed = variants.find((variant) => variant.id === id).source;
    assert.deepEqual(changed.notes.map((note) => [note.pitch, note.startTick, note.durationTick]), source.notes.map((note) => [note.pitch, note.startTick, note.durationTick]));
  }
});

test("v2 adds melody and ornament without changing the sealed v1 source generator", () => {
  const v1 = generateUsageCorpus(), v2 = generateUsageCorpusV2();
  assert.equal(v1.cases.length, 20);
  assert.equal(v2.cases.length, 26);
  assert.deepEqual(v2.cases.slice(0, 20), v1.cases);
  const roles = new Set(v2.cases.flatMap((item) => item.notes.map((note) => note.role)));
  for (const role of ["support", "bass", "melody", "ornament"]) assert.ok(roles.has(role));
});
