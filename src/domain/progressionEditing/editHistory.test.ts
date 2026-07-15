import { describe, expect, it } from "vitest";
import {
  canRedoProgressionEdit,
  canUndoProgressionEdit,
  createEditableProgression,
  redoProgressionEdit,
  replaceEditableChord,
  undoProgressionEdit,
} from ".";
import { makeCandidate } from "./testFixtures";

describe("progression edit history", () => {
  it("undoes and redoes replacement operations", () => {
    const editable = createEditableProgression(makeCandidate());
    const slotId = editable.slots[0]!.id;
    const chord = { ...editable.slots[0]!.currentChord, root: 2, label: "D" };
    const changed = replaceEditableChord(editable, slotId, chord, "manual-label");

    expect(canUndoProgressionEdit(changed)).toBe(true);
    const undone = undoProgressionEdit(changed);
    expect(undone.slots[0]?.currentChord.label).toBe("C");
    expect(canRedoProgressionEdit(undone)).toBe(true);
    expect(redoProgressionEdit(undone).slots[0]?.currentChord.label).toBe("D");
  });

  it("drops the redo branch after a new edit", () => {
    const editable = createEditableProgression(makeCandidate());
    const slotId = editable.slots[0]!.id;
    const d = { ...editable.slots[0]!.currentChord, root: 2, label: "D" };
    const e = { ...editable.slots[0]!.currentChord, root: 4, label: "E" };
    const changed = replaceEditableChord(editable, slotId, d, "manual-label");
    const branched = replaceEditableChord(
      undoProgressionEdit(changed),
      slotId,
      e,
      "manual-label",
    );

    expect(branched.history).toHaveLength(1);
    expect(canRedoProgressionEdit(branched)).toBe(false);
    expect(branched.slots[0]?.currentChord.label).toBe("E");
  });
});
