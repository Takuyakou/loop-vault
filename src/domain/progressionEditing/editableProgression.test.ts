import { describe, expect, it } from "vitest";
import {
  applyEditableProgression,
  applyEditableProgressionToSavedBlock,
  createEditableProgression,
  hasProgressionEdits,
  appendSuggestedEditableChord,
  markEditableProgressionSaved,
  progressionEditSummary,
  replaceEditableChord,
  replaceEditableChords,
  resetAllEditableChords,
  resetEditableChord,
  selectedEditableSlotIndex,
  selectEditableSlot,
  undoProgressionEdit,
} from ".";
import { gMajor, makeCandidate } from "./testFixtures";
import type { SavedProgressionBlock } from "../types";

describe("editable progression", () => {
  it("creates deterministic slots without sharing candidate chord data", () => {
    const candidate = makeCandidate();
    const first = createEditableProgression(candidate);
    const second = createEditableProgression(candidate);

    expect(first).toEqual(second);
    expect(first.slots.map((slot) => slot.id)).toEqual([
      "legacy:candidate-1:1:1:0",
      "legacy:candidate-1:1:3:1",
    ]);
    expect(first.slots[0]?.originalChord).not.toBe(candidate.chords[0]?.chord);
    expect(first.slots[0]?.currentChord).not.toBe(first.slots[0]?.originalChord);
  });

  it("replaces and resets a chord while keeping the source candidate immutable", () => {
    const candidate = makeCandidate();
    const editable = createEditableProgression(candidate);
    const slotId = editable.slots[0]!.id;
    const changed = replaceEditableChord(editable, slotId, gMajor, "manual-label");

    expect(changed.slots[0]).toMatchObject({
      currentChord: gMajor,
      edited: true,
      editSource: "manual-label",
    });
    expect(candidate.chords[0]!.chord.label).toBe("C");
    expect(progressionEditSummary(changed)).toEqual([
      expect.objectContaining({ original: "C", current: "G" }),
    ]);

    const reset = resetEditableChord(changed, slotId);
    expect(reset.slots[0]?.currentChord.label).toBe("C");
    expect(hasProgressionEdits(reset)).toBe(false);
  });

  it("applies only current chords to a cloned candidate", () => {
    const candidate = makeCandidate();
    const editable = createEditableProgression(candidate);
    const changed = replaceEditableChord(
      editable,
      editable.slots[1]!.id,
      gMajor,
      "alternative",
    );
    const applied = applyEditableProgression(candidate, changed);

    expect(applied.chords.map((item) => item.chord.label)).toEqual(["C", "G"]);
    expect(applied.chords[1]?.chord).not.toBe(gMajor);
    expect(candidate.chords[1]?.chord.label).toBe("C");
  });

  it("applies edits to a saved block without mutating its source metadata", () => {
    const candidate = makeCandidate();
    const block: SavedProgressionBlock = {
      id: candidate.id,
      summaryText: candidate.summaryText,
      chords: candidate.chords,
      sourceFileName: "song.mid",
      tags: ["main"],
      capturedAt: "2026-07-18T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const editable = createEditableProgression(block);
    const changed = replaceEditableChord(
      editable,
      editable.slots[0]!.id,
      gMajor,
      "alternative",
      { source: "smoothConnection", candidateRank: 3, displayedCandidateCount: 5 },
    );
    const saved = applyEditableProgressionToSavedBlock(block, changed);

    expect(saved).toMatchObject({
      id: block.id,
      sourceFileName: "song.mid",
      tags: ["main"],
      summaryText: "G - C",
      userEdited: true,
    });
    expect(saved.chords.map((item) => item.chord.label)).toEqual(["G", "C"]);
    expect(JSON.stringify(saved)).not.toContain("quickCandidateSelection");
    expect(JSON.stringify(saved)).not.toContain("smoothConnection");
    expect(block.summaryText).toBe(candidate.summaryText);
  });

  it("updates saved timing metadata after inserting a chord", () => {
    const candidate = makeCandidate();
    const block: SavedProgressionBlock = {
      id: candidate.id,
      summaryText: candidate.summaryText,
      chords: candidate.chords,
      lengthBars: 1,
      startBar: 1,
      endBar: 1,
      tags: [],
      capturedAt: "2026-07-18T00:00:00.000Z",
      analyzerVersion: "test",
    };
    const editable = createEditableProgression(block);
    const inserted = appendSuggestedEditableChord(editable, "C major");
    const saved = applyEditableProgressionToSavedBlock(block, inserted);

    expect(saved.chords).toHaveLength(3);
    expect(saved).toMatchObject({ startBar: 1, endBar: 2, lengthBars: 2 });
  });

  it("resets all edited slots in one history operation", () => {
    const editable = createEditableProgression(makeCandidate());
    const first = replaceEditableChord(editable, editable.slots[0]!.id, gMajor, "alternative");
    const second = replaceEditableChord(first, first.slots[1]!.id, gMajor, "structure-editor");
    const reset = resetAllEditableChords(second);

    expect(reset.slots.every((slot) => !slot.edited)).toBe(true);
    expect(reset.history).toHaveLength(3);
    expect(reset.history[2]).toMatchObject({ type: "reset" });
  });

  it("replaces multiple slots as one propagation operation and undoes them together", () => {
    const editable = createEditableProgression(makeCandidate());
    const slotIds = editable.slots.map((slot) => slot.id);
    const changed = replaceEditableChords(
      editable,
      [slotIds[1]!, slotIds[0]!, slotIds[1]!, "missing"],
      gMajor,
      "propagation",
    );

    expect(changed.slots.map((slot) => slot.currentChord.label)).toEqual(["G", "G"]);
    expect(changed.slots.map((slot) => slot.editSource)).toEqual([
      "propagation",
      "propagation",
    ]);
    expect(changed.history).toHaveLength(1);
    expect(changed.history[0]).toMatchObject({
      type: "replace",
      slotIds,
      editSource: "propagation",
    });

    const undone = undoProgressionEdit(changed);
    expect(undone.slots.map((slot) => slot.currentChord.label)).toEqual(["C", "C"]);
    expect(undone.historyIndex).toBe(0);
  });

  it("keeps batch no-ops referentially stable", () => {
    const editable = createEditableProgression(makeCandidate());
    expect(replaceEditableChords(editable, [], gMajor, "propagation")).toBe(editable);
    expect(replaceEditableChords(editable, ["missing"], gMajor, "propagation")).toBe(editable);
  });

  it("rebases a saved edit without losing the selected slot", () => {
    const editable = createEditableProgression(makeCandidate());
    const secondId = editable.slots[1]!.id;
    const selected = selectEditableSlot(editable, secondId);
    const changed = replaceEditableChord(selected, secondId, gMajor, "alternative");
    const saved = markEditableProgressionSaved(changed);

    expect(saved.selectedSlotId).toBe(secondId);
    expect(selectedEditableSlotIndex(saved)).toBe(1);
    expect(saved.slots[1]).toMatchObject({
      originalChord: gMajor,
      currentChord: gMajor,
      edited: false,
    });
    expect(saved.slots[1]).not.toHaveProperty("editSource");
    expect(saved.history).toEqual([]);
    expect(saved.historyIndex).toBe(0);
    expect(hasProgressionEdits(saved)).toBe(false);
  });

  it("does not disguise a missing selection as the first slot", () => {
    const editable = createEditableProgression(makeCandidate());
    expect(selectedEditableSlotIndex({ ...editable, selectedSlotId: "missing" })).toBeUndefined();
    expect(selectedEditableSlotIndex({ ...editable, selectedSlotId: undefined })).toBeUndefined();
  });
});
