import { describe, expect, it } from "vitest";
import { labelFromSymbol, makeChordSymbol, parseChordLabel } from "../chords";
import { replaceEditableChord } from "../progressionEditing/chordReplacement";
import {
  canMergeEditableChords,
  canSplitEditableChord,
  deleteEditableChord,
  insertSuggestedEditableChordAfter,
  mergeEditableChords,
  splitEditableChord,
} from "../progressionEditing/splitMerge";
import { redoProgressionEdit, undoProgressionEdit } from "../progressionEditing/editHistory";
import type { ChordTimelineItem } from "../types";
import { createManualDraft, editOperationCount } from "./manualDraft";
import {
  applyEditableToDraft,
  draftEditable,
  draftToCandidate,
  nudgeOperation,
  rangeNudges,
  recordDraftOperation,
  retargetDraftRange,
  validateDraft,
} from "./manualDraftEditing";

/**
 * Editing a draft.
 *
 * The point of these is that no editing logic is new: every operation below goes
 * through the functions the saved-progression editor already uses. What is tested
 * here is the translation in and out, and the two things drafts add — moving the
 * range, and refusing to save something unreadable.
 */
function chord(root: number, quality: Parameters<typeof makeChordSymbol>[1] = "maj7") {
  const symbol = makeChordSymbol(root, quality, []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

const TOTAL_BARS = 108;
const timeline: ChordTimelineItem[] = Array.from({ length: TOTAL_BARS }, (_unused, index) => ({
  bar: index + 1,
  beat: 1,
  durationBeats: 4,
  chord: chord((index * 5) % 12),
  confidence: 0.9,
  alternatives: [],
  warnings: [],
}));

function draftOf(startBar: number, endBar: number) {
  return createManualDraft({
    timeline,
    range: { startBar, startBeat: 1, endBar, endBeat: 4 },
    now: "2026-07-26T00:00:00.000Z",
  });
}

describe("handing a draft to the existing editor", () => {
  it("gives the editor one slot per chord in the range", () => {
    const draft = draftOf(14, 32);
    const editable = draftEditable(draft);

    expect(editable.slots).toHaveLength(19);
    expect(editable.slots[0].position.bar).toBe(14);
    expect(editable.slots[18].position.bar).toBe(32);
  });

  it("keeps a range that opens mid-chord inside its own bars", () => {
    const sustained: ChordTimelineItem[] = [
      { bar: 1, beat: 1, durationBeats: 16, chord: chord(0), confidence: 0.9, alternatives: [], warnings: [] },
      { bar: 5, beat: 1, durationBeats: 4, chord: chord(7), confidence: 0.9, alternatives: [], warnings: [] },
    ];
    const draft = createManualDraft({
      timeline: sustained,
      range: { startBar: 3, startBeat: 1, endBar: 5, endBeat: 4 },
      now: "2026-07-26T00:00:00.000Z",
    });
    const candidate = draftToCandidate(draft);

    // The source chord starts in bar 1. Showing that to the user would offer them
    // bars they did not select.
    expect(candidate.chords[0].bar).toBe(3);
    expect(candidate.chords.every((item) => item.bar >= 3 && item.bar <= 5)).toBe(true);
  });
});

describe("chord editing, through the editor that already exists", () => {
  it("replaces a chord", () => {
    const draft = draftOf(14, 17);
    const editable = draftEditable(draft);
    const replacement = parseChordLabel("C#m7b5")!;
    const edited = replaceEditableChord(editable, editable.slots[1].id, replacement, "manual-label");
    const next = applyEditableToDraft(draft, edited, [{
      type: "replace-chord",
      eventId: editable.slots[1].id,
      from: editable.slots[1].currentChord.label,
      to: "C#m7b5",
    }]);

    // The fixture's chord at this bar is Bbmaj7; the replacement has to differ
    // from it or "was this edited?" has nothing to detect.
    expect(draft.events[1].chord.label).not.toBe("C#m7b5");

    expect(next.events[1].chord.label).toBe("C#m7b5");
    expect(next.isDirty).toBe(true);
    expect(editOperationCount(next)).toBe(1);
  });

  it("splits a chord", () => {
    const draft = draftOf(14, 17);
    const editable = draftEditable(draft);
    expect(canSplitEditableChord(editable, editable.slots[0].id)).toBe(true);

    const next = applyEditableToDraft(draft, splitEditableChord(editable, editable.slots[0].id));
    expect(next.events).toHaveLength(5);
    expect(next.events[0].durationBeats).toBe(2);
  });

  it("merges two chords", () => {
    const draft = draftOf(14, 17);
    const editable = draftEditable(draft);
    const [first, second] = [editable.slots[0].id, editable.slots[1].id];
    expect(canMergeEditableChords(editable, first, second)).toBe(true);

    const next = applyEditableToDraft(draft, mergeEditableChords(editable, first, second));
    expect(next.events).toHaveLength(3);
    expect(next.events[0].durationBeats).toBe(8);
  });

  it("deletes a chord", () => {
    const draft = draftOf(14, 17);
    const editable = draftEditable(draft);

    const next = applyEditableToDraft(draft, deleteEditableChord(editable, editable.slots[1].id));
    expect(next.events).toHaveLength(3);
  });

  it("inserts a chord", () => {
    const draft = draftOf(14, 17);
    const editable = draftEditable(draft);
    // The editor picks the chord itself from the surrounding progression; the
    // third argument is the key it should reason in.
    const inserted = insertSuggestedEditableChordAfter(
      editable, editable.slots[0].id, "F major",
    );

    expect(applyEditableToDraft(draft, inserted).events.length).toBeGreaterThan(4);
  });

  it("undoes and redoes", () => {
    const draft = draftOf(14, 17);
    const editable = draftEditable(draft);
    const replacement = parseChordLabel("C#m7b5")!;
    const edited = replaceEditableChord(editable, editable.slots[1].id, replacement, "manual-label");

    const undone = undoProgressionEdit(edited);
    expect(applyEditableToDraft(draft, undone).events[1].chord.label)
      .toBe(draft.events[1].chord.label);

    const redone = redoProgressionEdit(undone);
    expect(applyEditableToDraft(draft, redone).events[1].chord.label).toBe("C#m7b5");
  });

  it("records undo and redo without counting them as edits", () => {
    let draft = draftOf(14, 17);
    draft = recordDraftOperation(draft, { type: "undo" });
    draft = recordDraftOperation(draft, { type: "redo" });

    expect(draft.repairOperations).toHaveLength(3);
    expect(editOperationCount(draft)).toBe(0);
  });
});

describe("moving the range", () => {
  it("extends the end and brings in the chords that were not in the draft", () => {
    const draft = draftOf(14, 32);
    const { draft: wider } = retargetDraftRange(
      draft, { startBar: 14, startBeat: 1, endBar: 40, endBeat: 4 }, timeline, { keepEdits: false },
    );

    expect(wider.lengthBars).toBe(27);
    expect(wider.events).toHaveLength(27);
    // Rebuilt from the timeline, not from the draft: the extra chords only exist
    // upstream.
    expect(wider.events[26].chord.label).toBe(timeline[39].chord.label);
  });

  it("shrinks the range", () => {
    const { draft: narrower } = retargetDraftRange(
      draftOf(14, 32), { startBar: 20, startBeat: 1, endBar: 24, endBeat: 4 }, timeline,
      { keepEdits: false },
    );

    expect(narrower.lengthBars).toBe(5);
    expect(narrower.events).toHaveLength(5);
  });

  it("carries edits over when asked to", () => {
    const draft = draftOf(14, 32);
    const editable = draftEditable(draft);
    const edited = applyEditableToDraft(
      draft,
      replaceEditableChord(editable, editable.slots[1].id, parseChordLabel("C#m7b5")!, "manual-label"),
    );

    const { draft: wider, droppedEditCount } = retargetDraftRange(
      edited, { startBar: 14, startBeat: 1, endBar: 40, endBeat: 4 }, timeline, { keepEdits: true },
    );

    expect(wider.events[1].chord.label).toBe("C#m7b5");
    expect(droppedEditCount).toBe(0);
  });

  it("reports the edits a smaller range cannot keep", () => {
    const draft = draftOf(14, 32);
    const editable = draftEditable(draft);
    const edited = applyEditableToDraft(
      draft,
      replaceEditableChord(editable, editable.slots[18].id, parseChordLabel("C#m7b5")!, "manual-label"),
    );

    const { droppedEditCount } = retargetDraftRange(
      edited, { startBar: 14, startBeat: 1, endBar: 20, endBeat: 4 }, timeline, { keepEdits: true },
    );

    // The edited chord was in bar 32, which the new range does not contain. The
    // user is told rather than left to notice.
    expect(droppedEditCount).toBe(1);
  });

  it("discards edits when asked to, and says how many", () => {
    const draft = draftOf(14, 32);
    const editable = draftEditable(draft);
    const edited = applyEditableToDraft(
      draft,
      replaceEditableChord(editable, editable.slots[1].id, parseChordLabel("C#m7b5")!, "manual-label"),
    );

    const { draft: reset, droppedEditCount } = retargetDraftRange(
      edited, { startBar: 14, startBeat: 1, endBar: 32, endBeat: 4 }, timeline, { keepEdits: false },
    );

    expect(reset.events[1].chord.label).toBe(draft.events[1].chord.label);
    expect(droppedEditCount).toBe(1);
    expect(reset.isDirty).toBe(false);
  });

  it("records the reselection", () => {
    const { draft } = retargetDraftRange(
      draftOf(14, 32), { startBar: 14, startBeat: 1, endBar: 33, endBeat: 4 }, timeline,
      { keepEdits: false },
    );

    expect(draft.repairOperations.some((operation) => operation.type === "reselect-range")).toBe(true);
  });

  it("refuses a range with nothing in it", () => {
    expect(() => retargetDraftRange(
      draftOf(14, 32), { startBar: 400, startBeat: 1, endBar: 420, endBeat: 4 }, timeline,
      { keepEdits: false },
    )).toThrow(/no-chords-in-range/);
  });

  it("names every nudge in both units and both directions", () => {
    expect(rangeNudges).toHaveLength(8);
    expect(nudgeOperation({ edge: "end", unit: "bar", delta: 1 }, 4))
      .toEqual({ type: "extend-end", beats: 4 });
    expect(nudgeOperation({ edge: "start", unit: "beat", delta: -1 }, 4))
      .toEqual({ type: "extend-start", beats: 1 });
    expect(nudgeOperation({ edge: "start", unit: "beat", delta: 1 }, 4))
      .toEqual({ type: "trim-start", beats: 1 });
    expect(nudgeOperation({ edge: "end", unit: "bar", delta: -1 }, 4))
      .toEqual({ type: "trim-end", beats: 4 });
  });
});

describe("validating before save", () => {
  it("accepts a clean draft", () => {
    const validation = validateDraft(draftOf(14, 32));

    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toEqual([]);
    expect(validation.canSave).toBe(true);
  });

  it("refuses a chord with no length", () => {
    const draft = draftOf(14, 17);
    draft.events[1] = { ...draft.events[1], durationBeats: 0 };

    expect(validateDraft(draft).errors).toContainEqual({
      kind: "non-positive-duration", eventIndex: 1,
    });
    expect(validateDraft(draft).canSave).toBe(false);
  });

  it("refuses an event outside its own block", () => {
    const draft = draftOf(14, 17);
    draft.events[1] = { ...draft.events[1], relativeStartBeat: 400 };

    expect(validateDraft(draft).errors.some((issue) => issue.kind === "outside-range")).toBe(true);
  });

  it("refuses a label no parser accepts", () => {
    const draft = draftOf(14, 17);
    draft.events[1] = {
      ...draft.events[1],
      chord: { ...draft.events[1].chord, label: "H♯wobble" },
    };

    expect(validateDraft(draft).errors.some((issue) => issue.kind === "unparseable-chord")).toBe(true);
  });

  it("accepts a written rest", () => {
    const draft = draftOf(14, 17);
    draft.events[1] = { ...draft.events[1], chord: { ...draft.events[1].chord, label: "N.C." } };

    expect(validateDraft(draft).errors).toEqual([]);
  });

  it("refuses a duplicated event id", () => {
    const draft = draftOf(14, 17);
    draft.events[1] = { ...draft.events[1], sourceEventId: "same" };
    draft.events[2] = { ...draft.events[2], sourceEventId: "same" };

    expect(validateDraft(draft).errors.some((issue) => issue.kind === "duplicate-id")).toBe(true);
  });

  it("warns about a gap without refusing it", () => {
    const draft = draftOf(14, 17);
    draft.events[1] = { ...draft.events[1], durationBeats: 2 };

    const validation = validateDraft(draft);
    expect(validation.warnings).toContainEqual({ kind: "gap", eventIndex: 2, beats: 2 });
    // A rest between two chords is something real music does.
    expect(validation.canSave).toBe(true);
  });

  it("warns about an overlap without refusing it", () => {
    const draft = draftOf(14, 17);
    draft.events[1] = { ...draft.events[1], durationBeats: 6 };

    const validation = validateDraft(draft);
    expect(validation.warnings).toContainEqual({ kind: "overlap", eventIndex: 2, beats: 2 });
    expect(validation.canSave).toBe(true);
  });

  it("refuses an empty draft", () => {
    const draft = draftOf(14, 17);
    expect(validateDraft({ ...draft, events: [] }).canSave).toBe(false);
  });
});
