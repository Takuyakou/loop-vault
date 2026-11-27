import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { criticalUiSpecs } from "./selection.mjs";
import { EXTENDED_ARCHIVE_SPECS, EXTENDED_HEAVY_SPECS, EXTENDED_REALTIME_AUDIO_SPECS, partitionE2eSpecs } from "./tiers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const allSpecs = readdirSync(join(root, "e2e"))
  .filter((file) => file.endsWith(".spec.ts"))
  .sort()
  .map((file) => `e2e/${file}`);

test("every e2e spec belongs to exactly one tier with zero drops", () => {
  const { core, extendedLight, extendedHeavy, extendedRealtimeAudio } = partitionE2eSpecs(allSpecs);
  const combined = [...core, ...extendedLight, ...extendedHeavy, ...extendedRealtimeAudio].sort();
  assert.deepEqual(combined, allSpecs);
  assert.equal(new Set(combined).size, allSpecs.length);
  assert.ok(core.length > 0, "core tier must not be empty");
});

test("all explicit extended spec entries exist on disk and do not overlap", () => {
  const allSet = new Set(allSpecs);
  const heavySet = new Set(EXTENDED_HEAVY_SPECS);
  const realtimeAudioSet = new Set(EXTENDED_REALTIME_AUDIO_SPECS);
  for (const spec of EXTENDED_HEAVY_SPECS) {
    assert.ok(allSet.has(spec), `missing heavy spec: ${spec}`);
  }
  for (const spec of EXTENDED_REALTIME_AUDIO_SPECS) {
    assert.ok(allSet.has(spec), `missing real-time audio spec: ${spec}`);
    assert.ok(!heavySet.has(spec), `spec listed in both real-time audio and heavy: ${spec}`);
  }
  for (const spec of EXTENDED_ARCHIVE_SPECS) {
    assert.ok(allSet.has(spec), `missing archive spec: ${spec}`);
    assert.ok(!heavySet.has(spec), `spec listed in both heavy and archive: ${spec}`);
    assert.ok(!realtimeAudioSet.has(spec), `spec listed in both real-time audio and archive: ${spec}`);
  }
});

test("the real-time audio specs run one at a time after the heavy pass", () => {
  const { extendedRealtimeAudio, extendedHeavy } = partitionE2eSpecs(allSpecs);
  const realtimeSet = new Set(extendedRealtimeAudio);
  const heavySet = new Set(extendedHeavy);
  for (const spec of ["e2e/dojo-display-judge.spec.ts", "e2e/phase13-bass-practice.spec.ts", "e2e/preview-fade.spec.ts"]) {
    assert.ok(realtimeSet.has(spec), `real-time audio spec must be in extendedRealtimeAudio: ${spec}`);
    assert.ok(!heavySet.has(spec), `real-time audio spec must not stay in extendedHeavy: ${spec}`);
  }
});

test("all criticalUiSpecs stay in core", () => {
  const { core } = partitionE2eSpecs(allSpecs);
  const coreSet = new Set(core);
  for (const spec of criticalUiSpecs) {
    assert.ok(coreSet.has(spec), `criticalUiSpec must remain in core: ${spec}`);
  }
});

test("guided-course specs stay in core", () => {
  const { core } = partitionE2eSpecs(allSpecs);
  const coreSet = new Set(core);
  const guided = allSpecs.filter((spec) => /^e2e\/p23-(42|4[4-9]|[5-9]\d)-/.test(spec) && !EXTENDED_HEAVY_SPECS.includes(spec));
  for (const spec of guided) assert.ok(coreSet.has(spec), `guided-course spec must stay in core: ${spec}`);
});
