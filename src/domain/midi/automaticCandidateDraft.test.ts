import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import { replaceEditableChord } from "../progressionEditing/chordReplacement";
import type { ChordTimelineItem, ProgressionBlockCandidate } from "../types";
import { buildCandidateEvents, candidateStats } from "./candidateBlock";
import {
  createDraftFromCandidate,
  createManualDraft,
  fingerprintTimeline,
} from "./manualDraft";
import {
  applyEditableToDraft,
  draftEditable,
  draftToCandidate,
} from "./manualDraftEditing";

const timeline: ChordTimelineItem[] = ["Cmaj7", "Am7", "Dm7", "G7"].map(
  (label, index) => ({
    eventId: `event-${index + 1}`,
    bar: index + 1,
    beat: 1,
    durationBeats: 4,
    chord: parseChordLabel(label)!,
    confidence: 0.8 + index * 0.03,
    alternatives: [],
    warnings: index === 3 ? ["ambiguous-bass"] : [],
  }),
);

function candidate(): ProgressionBlockCandidate {
  const events = buildCandidateEvents(timeline, 1, 4, 4);
  return {
    id: "candidate-1",
    startBar: 1,
    endBar: 4,
    lengthBars: 4,
    chords: timeline,
    events,
    stats: candidateStats(events, 4),
    structuredSignature: "sig-1",
    summaryText: "Cmaj7 · Am7 · Dm7 · G7",
    confidence: 0.91,
    selectionScore: 1.2345,
    repeatCount: 3,
    labels: ["main", "turnaround"],
    kind: "progression",
    warnings: ["ambiguous-bass"],
  };
}

describe("automatic candidate Draft", () => {
  it("copies source identity, range and events without mutating the candidate", () => {
    const original = candidate();
    const before = structuredClone(original);
    const draft = createDraftFromCandidate({
      candidate: original,
      timelineFingerprint: fingerprintTimeline(timeline),
      patternId: "pattern-1",
      occurrenceId: "occurrence-2",
      now: "2026-07-26T00:00:00.000Z",
      draftId: "draft-1",
    });

    expect(draft.source).toEqual({
      type: "automatic-candidate",
      candidateId: "candidate-1",
      patternId: "pattern-1",
      occurrenceId: "occurrence-2",
    });
    expect(draft.selectedRange).toEqual({
      startBar: 1,
      startBeat: 1,
      endBar: 4,
      endBeat: 4,
    });
    expect(draft.snapMode).toBe("bar");
    expect(draft.events).toEqual(original.events);
    expect(draft.events).not.toBe(original.events);
    expect(original).toEqual(before);
  });

  it("round-trips an untouched candidate exactly", () => {
    const original = candidate();
    const draft = createDraftFromCandidate({
      candidate: original,
      timelineFingerprint: fingerprintTimeline(timeline),
      now: "2026-07-26T00:00:00.000Z",
    });
    const saved = draftToCandidate(draft);

    expect(saved).toEqual(original);
    expect(saved).not.toBe(original);
    expect(saved.chords).not.toBe(original.chords);
  });

  it("writes edits to the Draft while preserving the source snapshot", () => {
    const original = candidate();
    const draft = createDraftFromCandidate({
      candidate: original,
      timelineFingerprint: fingerprintTimeline(timeline),
      now: "2026-07-26T00:00:00.000Z",
    });
    const editable = draftEditable(draft);
    const edited = applyEditableToDraft(
      draft,
      replaceEditableChord(
        editable,
        editable.slots[1]!.id,
        parseChordLabel("Fmaj7")!,
        "manual-label",
      ),
    );

    expect(draftToCandidate(edited).chords[1]!.chord.label).toBe("Fmaj7");
    expect(edited.sourceCandidateSnapshot).toEqual(original);
    expect(original.chords[1]!.chord.label).toBe("Am7");
  });

  it("keeps manual ranges on the same source union", () => {
    const draft = createManualDraft({
      timeline,
      range: { startBar: 1, startBeat: 1, endBar: 4, endBeat: 4 },
      now: "2026-07-26T00:00:00.000Z",
    });

    expect(draft.source).toEqual({ type: "manual-range" });
    expect(draft.snapMode).toBe("beat");
    expect(draft.sourceCandidateSnapshot).toBeUndefined();
  });
});
