import { describe, expect, it } from "vitest";
import {
  canMergeEditableChords,
  createEditableProgression,
  deleteEditableChord,
  appendSuggestedEditableChord,
  insertSuggestedEditableChordAfter,
  quickCandidatesForSlot,
  hasProgressionEdits,
  mergeEditableChords,
  progressionSpan,
  redoProgressionEdit,
  resetAllEditableChords,
  resetEditableChord,
  splitEditableChord,
  undoProgressionEdit,
  validateEditableProgression,
} from ".";
import { makeCandidate } from "./testFixtures";

describe("progression structural editing", () => {
  it("appends the top generated suggestion and exposes follow-up candidates", () => {
    const editable = createEditableProgression(makeCandidate());
    const inserted = appendSuggestedEditableChord(editable, "C major");

    expect(inserted.slots).toHaveLength(3);
    expect(inserted.slots.map((slot) => [slot.position.bar, slot.position.beat])).toEqual([
      [1, 1],
      [1, 3],
      [2, 1],
    ]);
    expect(inserted.slots[2]).toMatchObject({
      edited: true,
      editSource: "insert",
    });
    expect(inserted.slots[2]!.currentChord.label).not.toBe(editable.slots[1]!.currentChord.label);
    expect(quickCandidatesForSlot({
      editable: inserted,
      slotId: inserted.slots[2]!.id,
      keySignature: "C major",
    }).length).toBeGreaterThan(1);
    expect(inserted.selectedSlotId).toBe(inserted.slots[2]!.id);
    expect(validateEditableProgression(inserted)).toEqual([]);

    const undone = undoProgressionEdit(inserted);
    expect(undone.slots).toHaveLength(2);
    expect(redoProgressionEdit(undone).slots).toHaveLength(3);
    expect(hasProgressionEdits(resetEditableChord(inserted, inserted.slots[2]!.id))).toBe(true);
    const reset = resetAllEditableChords(inserted);
    expect(reset.slots).toHaveLength(2);
    expect(hasProgressionEdits(reset)).toBe(false);
  });

  it("inserts after any slot, shifts later timing, and selects a generated chord", () => {
    const editable = createEditableProgression(makeCandidate());
    const first = editable.slots[0]!;
    const second = editable.slots[1]!;
    const inserted = insertSuggestedEditableChordAfter(editable, first.id, "C major");

    expect(inserted.slots).toHaveLength(3);
    expect(inserted.slots[1]!.editSource).toBe("insert");
    expect(inserted.slots[1]!.currentChord.label).not.toBe(first.currentChord.label);
    expect(inserted.slots[2]!.id).toBe(second.id);
    expect(inserted.slots[2]!.position).toEqual({
      bar: 2,
      beat: 1,
      durationBeats: second.position.durationBeats,
    });
    expect(inserted.selectedSlotId).toBe(inserted.slots[1]!.id);
    expect(validateEditableProgression(inserted)).toEqual([]);
    expect(quickCandidatesForSlot({
      editable: inserted,
      slotId: inserted.slots[1]!.id,
      keySignature: "C major",
    }).length).toBeGreaterThan(1);
  });

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

  it("selects the next slot after a middle deletion, then falls back to the previous slot", () => {
    const editable = createEditableProgression(makeCandidate());
    const split = splitEditableChord(editable, editable.slots[0]!.id);
    const middleId = split.slots[1]!.id;
    const afterMiddleDelete = deleteEditableChord(split, middleId);

    expect(afterMiddleDelete.selectedSlotId).toBe(afterMiddleDelete.slots[1]!.id);

    const lastId = afterMiddleDelete.slots[afterMiddleDelete.slots.length - 1]!.id;
    const afterLastDelete = deleteEditableChord(afterMiddleDelete, lastId);
    expect(afterLastDelete.selectedSlotId).toBe(
      afterLastDelete.slots[afterLastDelete.slots.length - 1]!.id,
    );
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
