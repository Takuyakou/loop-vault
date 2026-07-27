import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import type { ChordTimelineItem } from "../types";
import { undoCaptureDraft } from "./captureEditHistory";
import { createManualDraft } from "./manualDraft";
import { draftPreviewTimeline } from "./manualDraftPlayback";
import {
  cycleDraftSnapMode,
  resizeDraftBoundary,
  retargetDraftByAbsoluteBeats,
  setDraftSnapMode,
  snapAbsoluteBeat,
} from "./draftRangeEditing";

const longTimeline: ChordTimelineItem[] = Array.from({ length: 40 }, (_unused, index) => ({
  eventId: `event-${index + 1}`,
  bar: index + 1,
  beat: 1,
  durationBeats: 4,
  chord: parseChordLabel(index % 2 === 0 ? "Cmaj7" : "G7")!,
  confidence: 0.9,
  alternatives: [],
  warnings: [],
}));

function draft(startBar: number, endBar: number) {
  return createManualDraft({
    timeline: longTimeline,
    range: { startBar, startBeat: 1, endBar, endBeat: 4 },
    now: "2026-07-26T00:00:00.000Z",
  });
}

const twoChordBar: ChordTimelineItem[] = [
  {
    eventId: "left",
    bar: 1,
    beat: 1,
    durationBeats: 2,
    chord: parseChordLabel("Cmaj7")!,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  },
  {
    eventId: "right",
    bar: 1,
    beat: 3,
    durationBeats: 2,
    chord: parseChordLabel("G7")!,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  },
];

describe("Draft range editing", () => {
  it("extends 8 bars to 32 and undoes exactly", () => {
    const before = draft(1, 8);
    const after = retargetDraftByAbsoluteBeats(
      before,
      longTimeline,
      0,
      32 * 4,
      40,
      { keepEdits: true },
    ).draft;

    expect(after.selectedRange.endBar).toBe(32);
    expect(after.events).toHaveLength(32);
    expect(after.history).toHaveLength(1);
    expect(undoCaptureDraft(after).selectedRange.endBar).toBe(8);
  });

  it.each([19, 22])("keeps the %s-bar manual rescue regression", (bars) => {
    const before = draft(1, 8);
    const after = retargetDraftByAbsoluteBeats(
      before,
      longTimeline,
      0,
      bars * 4,
      40,
      { keepEdits: true },
    ).draft;

    expect(after.lengthBars).toBe(bars);
    expect(after.events).toHaveLength(bars);
  });

  it("changes snap mode through the shared history", () => {
    const before = draft(1, 8);
    const harmonic = setDraftSnapMode(before, "harmonic");
    const beat = cycleDraftSnapMode(harmonic);

    expect(harmonic.snapMode).toBe("harmonic");
    expect(beat.snapMode).toBe("beat");
    expect(beat.history).toHaveLength(2);
    expect(undoCaptureDraft(beat).snapMode).toBe("harmonic");
  });

  it("supports bar, harmonic, beat, and Alt bypass snapping", () => {
    expect(snapAbsoluteBeat(6.3, "bar", longTimeline, 4)).toBe(8);
    expect(snapAbsoluteBeat(6.3, "beat", longTimeline, 4)).toBe(6);
    expect(snapAbsoluteBeat(6.3, "harmonic", longTimeline, 4)).toBe(8);
    expect(snapAbsoluteBeat(6.3, "bar", longTimeline, 4, true)).toBe(6.25);
  });
});

describe("Draft chord boundary editing", () => {
  function boundaryDraft() {
    return createManualDraft({
      timeline: twoChordBar,
      range: { startBar: 1, startBeat: 1, endBar: 1, endBeat: 4 },
      now: "2026-07-26T00:00:00.000Z",
    });
  }

  it("moves both sides without a gap or overlap and undoes exactly", () => {
    const before = { ...boundaryDraft(), snapMode: "beat" as const };
    const after = resizeDraftBoundary(before, "left", 3);

    expect(after.events[0]!.durationBeats).toBe(3);
    expect(after.events[1]!.relativeStartBeat).toBe(3);
    expect(after.events[1]!.durationBeats).toBe(1);
    expect(after.events[0]!.durationBeats + after.events[1]!.durationBeats).toBe(4);

    const restored = undoCaptureDraft(after);
    expect(restored.events).toEqual(before.events);
  });

  it("bypasses snap with Alt and immediately changes preview timing", () => {
    const before = boundaryDraft();
    const after = resizeDraftBoundary(before, "left", 2.5, { disableSnap: true });

    expect(after.events[0]!.durationBeats).toBe(2.5);
    expect(draftPreviewTimeline(after)[0]!.durationBeats).toBe(2.5);
    expect(draftPreviewTimeline(after)[1]!.beat).toBe(3.5);
  });

  it("keeps chord identity and source voicing while resizing", () => {
    const before = boundaryDraft();
    before.events[0] = {
      ...before.events[0]!,
      source: {
        ...before.events[0]!.source,
        voicingMemory: {
          sourceVoicing: {
            schemaVersion: 1,
            source: "midi-extracted",
            representation: "simultaneous-voicing",
            midiNotes: [48, 52, 55, 59],
            capturedForChordKey: "0:maj7::",
          },
        },
      },
    };
    const after = resizeDraftBoundary(before, "left", 3, { disableSnap: true });

    expect(after.events[0]!.chord.label).toBe("Cmaj7");
    expect(after.events[1]!.chord.label).toBe("G7");
    expect(after.events[0]!.source.voicingMemory).toEqual(
      before.events[0]!.source.voicingMemory,
    );
  });

  it("is deterministic", () => {
    const before = boundaryDraft();
    expect(resizeDraftBoundary(before, "left", 2.75, { disableSnap: true }))
      .toEqual(resizeDraftBoundary(before, "left", 2.75, { disableSnap: true }));
  });
});
