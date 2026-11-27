import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCoreResult } from "./coreResult.mjs";
const base = {
  sourceTruth: { notes: [{ noteId: "n1", midiNote: 60, onsetTick: 0, offsetTick: 480 }] },
  excludedNotes: [{ noteId: "n1", midiNote: 60, sourceTick: 0, durationTick: 480, confidence: 0.8, restorable: true }],
  harmonicInterpretation: [{ sourceNoteIds: ["n1"] }],
};
test("excluded notes retain exact source evidence", () => {
  assert.deepEqual(validateCoreResult(base), []);
  assert.deepEqual(validateCoreResult({ ...base, excludedNotes: [{ ...base.excludedNotes[0], midiNote: 61 }] }), ["excluded note not restorable from sourceTruth"]);
});
test("result cannot reference a missing source note", () => {
  assert.deepEqual(validateCoreResult({ ...base, harmonicInterpretation: [{ sourceNoteIds: ["missing"] }] }), ["dangling source note reference"]);
});
