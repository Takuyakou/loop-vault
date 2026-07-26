import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import { replaceEditableChord } from "../progressionEditing/chordReplacement";
import type { ChordTimelineItem } from "../types";
import {
  canRedoCaptureDraft,
  canUndoCaptureDraft,
  jumpCaptureDraftHistory,
  MAX_CAPTURE_EDIT_HISTORY,
  redoCaptureDraft,
  undoCaptureDraft,
} from "./captureEditHistory";
import { createManualDraft, fingerprintTimeline } from "./manualDraft";
import {
  applyEditableToDraft,
  draftEditable,
  draftToCandidate,
  retargetDraftRange,
} from "./manualDraftEditing";
import { createDraftFromCandidate } from "./manualDraft";

const timeline: ChordTimelineItem[] = Array.from({ length: 8 }, (_unused, index) => ({
  eventId: `event-${index + 1}`,
  bar: index + 1,
  beat: 1,
  durationBeats: 4,
  chord: parseChordLabel(index % 2 === 0 ? "Cmaj7" : "G7")!,
  confidence: 0.9,
  alternatives: [],
  warnings: [],
}));

function manualDraft() {
  return createManualDraft({
    timeline,
    range: { startBar: 1, startBeat: 1, endBar: 4, endBeat: 4 },
    now: "2026-07-26T00:00:00.000Z",
    draftId: "draft-history",
  });
}

function replaceFirst(
  draft: ReturnType<typeof manualDraft>,
  label: string,
) {
  const editable = draftEditable(draft);
  return applyEditableToDraft(
    draft,
    replaceEditableChord(
      editable,
      editable.slots[0]!.id,
      parseChordLabel(label)!,
      "manual-label",
    ),
    [{
      type: "replace-chord",
      eventId: editable.slots[0]!.id,
      from: editable.slots[0]!.currentChord.label,
      to: label,
    }],
  );
}

describe("Capture Draft history", () => {
  it("undoes and redoes a mixed chord and range sequence in one stack", () => {
    const edited = replaceFirst(manualDraft(), "Fmaj7");
    const ranged = retargetDraftRange(
      edited,
      { startBar: 1, startBeat: 1, endBar: 5, endBeat: 4 },
      timeline,
      {
        keepEdits: true,
        operation: { type: "extend-end", beats: 4 },
      },
    ).draft;

    expect(ranged.history).toHaveLength(2);
    expect(ranged.selectedRange.endBar).toBe(5);
    expect(draftToCandidate(ranged).chords[0]!.chord.label).toBe("Fmaj7");

    const undoRange = undoCaptureDraft(ranged);
    expect(undoRange.selectedRange.endBar).toBe(4);
    expect(draftToCandidate(undoRange).chords[0]!.chord.label).toBe("Fmaj7");

    const undoChord = undoCaptureDraft(undoRange);
    expect(draftToCandidate(undoChord).chords[0]!.chord.label).toBe("Cmaj7");
    expect(canUndoCaptureDraft(undoChord)).toBe(false);

    const redoChord = redoCaptureDraft(undoChord);
    const redoRange = redoCaptureDraft(redoChord);
    expect(draftToCandidate(redoRange).chords[0]!.chord.label).toBe("Fmaj7");
    expect(redoRange.selectedRange.endBar).toBe(5);
    expect(canRedoCaptureDraft(redoRange)).toBe(false);
  });

  it("breaks the redo branch after a new edit", () => {
    const second = replaceFirst(replaceFirst(manualDraft(), "Fmaj7"), "Dm7");
    const undone = undoCaptureDraft(second);
    const branched = replaceFirst(undone, "Am7");

    expect(branched.history).toHaveLength(2);
    expect(canRedoCaptureDraft(branched)).toBe(false);
    expect(draftToCandidate(branched).chords[0]!.chord.label).toBe("Am7");
  });

  it("keeps at most 64 operations", () => {
    let draft = manualDraft();
    for (let index = 0; index < 70; index += 1) {
      draft = replaceFirst(draft, index % 2 === 0 ? "Fmaj7" : "Dm7");
    }

    expect(draft.history).toHaveLength(MAX_CAPTURE_EDIT_HISTORY);
    expect(draft.historyIndex).toBe(MAX_CAPTURE_EDIT_HISTORY - 1);
  });

  it("jumps to an arbitrary retained point", () => {
    const first = replaceFirst(manualDraft(), "Fmaj7");
    const second = replaceFirst(first, "Dm7");
    const third = replaceFirst(second, "Am7");

    expect(draftToCandidate(jumpCaptureDraftHistory(third, 0)).chords[0]!.chord.label)
      .toBe("Fmaj7");
    expect(draftToCandidate(jumpCaptureDraftHistory(third, 1)).chords[0]!.chord.label)
      .toBe("Dm7");
    expect(draftToCandidate(jumpCaptureDraftHistory(third, -1)).chords[0]!.chord.label)
      .toBe("Cmaj7");
  });

  it("works for automatic-candidate Drafts without exposing history in the candidate", () => {
    const source = draftToCandidate(manualDraft());
    const automatic = createDraftFromCandidate({
      candidate: source,
      timelineFingerprint: fingerprintTimeline(timeline),
      now: "2026-07-26T00:00:00.000Z",
    });
    const edited = replaceFirst(automatic, "Fmaj7");
    const candidate = draftToCandidate(edited) as unknown as Record<string, unknown>;

    expect(edited.history).toHaveLength(1);
    expect(candidate.history).toBeUndefined();
    expect(candidate.historyIndex).toBeUndefined();
  });
});
