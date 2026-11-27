import { test } from "node:test";
import assert from "node:assert/strict";
import midiPackage from "@tonejs/midi";
const { Midi } = midiPackage;
import { generateUsageCorpusV2 } from "./usageProfileV2.mjs";
import { encodeUsageCase } from "./encodeUsage.mjs";
test("every public usage case encodes deterministically with its note facts", () => {
  for (const item of generateUsageCorpusV2().cases) {
    const first = encodeUsageCase(item), second = encodeUsageCase(item);
    assert.deepEqual(first, second);
    const parsed = new Midi(first);
    const count = parsed.tracks.reduce((n, track) => n + track.notes.length, 0);
    assert.equal(count, item.notes.length);
    assert.deepEqual(parsed.header.timeSignatures[0].timeSignature, item.meter);
  }
});
