import { describe, expect, it } from "vitest";
import {
  canMergeEditableChords,
  createEditableProgression,
  deleteEditableChord,
  mergeEditableChords,
  progressionSpan,
  splitEditableChord,
  undoProgressionEdit,
  validateEditableProgression,
} from ".";
import { makeCandidate } from "./testFixtures";

describe("progression structural editing", () => {
  it("splits at the midpoint and preserves the progression span", () => {
    const editable = createEditableProgression(makeCandidate());
    const before = progressionSpan(editable.slots);
    const split = splitEditableChord(editable, editable.slots[0]!.id);

    expect(split.slots.map((slot) => slot.position.durationBeats)).toEqual([1, 1, 2]);
    expect(progressionSpan(split.slots)).toEqual(before);
    expect(validateEditableProgression(split)).toEqual([]);
    expect(undoProgressionEdit(split).slots).toHaveLength(2);
  });

  it("merges adjacent slots and rejects reversed or missing neighbors", () => {
    const editable = createEditableProgression(makeCandidate());
    const [first, second] = editable.slots;

    expect(canMergeEditableChords(editable, first!.id, second!.id)).toBe(true);
    expect(canMergeEditableChords(editable, second!.id, first!.id)).toBe(false);
    const merged = mergeEditableChords(editable, first!.id, second!.id, "second");
    expect(merged.slots).toHaveLength(1);
    expect(merged.slots[0]).toMatchObject({
      currentChord: second!.currentChord,
      position: { durationBeats: 4 },
      editSource: "merge",
    });
  });

  it("deletes first and later slots without changing the total span", () => {
    const editable = createEditableProgression(makeCandidate());
    const before = progressionSpan(editable.slots);
    const withoutFirst = deleteEditableChord(editable, editable.slots[0]!.id);
    const withoutLast = deleteEditableChord(editable, editable.slots[1]!.id);

    expect(progressionSpan(withoutFirst.slots)).toEqual(before);
    expect(progressionSpan(withoutLast.slots)).toEqual(before);
    expect(validateEditableProgression(withoutFirst)).toEqual([]);
    expect(validateEditableProgression(withoutLast)).toEqual([]);
  });

  it("does not delete the last remaining slot", () => {
    const editable = createEditableProgression(makeCandidate());
    const merged = mergeEditableChords(
      editable,
      editable.slots[0]!.id,
      editable.slots[1]!.id,
    );
    expect(deleteEditableChord(merged, merged.slots[0]!.id)).toBe(merged);
  });
});
