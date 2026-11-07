import { describe, expect, it } from "vitest";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import {
  buildCorrectionModel,
  cutFragments,
  refreshModel,
  removedBarsOf,
  type CorrectionCard,
  type CorrectionModel,
  type SourceNoteRef,
} from "./correctionModel";
import { chooseName, cutBars } from "./cardEdits";
import { deleteNotes } from "./edits";
import { buildSaveCandidate, cardSourceRanges } from "./saveCandidate";
import { reviewThresholds } from "./reviewThresholds";
import { screenToSource, sourceToScreen } from "./barMap";
import { buildCorrectionEvents } from "../midi/feedback";
import { buildLabelCorrectionLogs } from "../midi/labelCorrectionLog";
import { buildProgressionSaveFeedbackEvent } from "../midi/analysisFeedback";
import { toSavedProgressionBlock } from "../../store/vaultStore";
import type { ChordTimelineItem } from "../types";

/** P17-02 Stage 01: 「小節を消して詰める」 in the MIDI capture. */

const inputs = new Map<string, ReturnType<typeof analyzeScenario>>();
function fresh(id: string): CorrectionModel {
  if (!inputs.has(id)) inputs.set(id, analyzeScenario(p10Scenario(id)));
  return buildCorrectionModel(inputs.get(id)!, reviewThresholds);
}
/** A hand-built model with the same context, for exact spans (¼-beat slivers, one long card). */
function modelWith(
  base: CorrectionModel,
  specs: readonly { id: string; start: number; duration: number }[],
  sourceNotes: readonly SourceNoteRef[],
  totalBeats: number,
): CorrectionModel {
  const meter = base.context.meter;
  const template = base.cards[0]!;
  const cards: CorrectionCard[] = specs.map((spec, index) => ({
    ...template,
    id: spec.id,
    start: spec.start,
    duration: spec.duration,
    bar: Math.floor(spec.start / meter + 1e-6) + 1,
    beat: spec.start - Math.floor(spec.start / meter + 1e-6) * meter + 1,
    timelineIndex: index,
    reviewReasons: [],
    reviewed: true,
    suggestedName: undefined,
    nameUnreadable: undefined,
    attacks: 1,
    edited: false,
    nameSource: "auto",
  }));
  const context = { ...base.context, sourceNotes, removedBars: [] };
  const notes = cards.flatMap((card) => cutFragments(card, context));
  return refreshModel({ ...base, cards, notes, segments: [], totalBeats, context }, "all", false);
}

function saveContext(id: string) {
  const input = inputs.get(id)!;
  let n = 0;
  return {
    input,
    context: {
      idFactory: () => `id-${++n}`,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      sourceData: input.sourceData,
      sourceVoices: input.sourceVoices,
    },
  };
}

describe("cutBars (P17-02)", () => {
  it("removes a middle bar, moves the later cards left and keeps the source notes untouched", () => {
    const model = fresh("plain-8");
    const out = cutBars(model, 2);
    expect(out.changed).toBe(true);
    const next = out.model;
    expect(next.cards).toHaveLength(7);
    expect(next.totalBeats).toBe(28);
    expect(removedBarsOf(next)).toEqual([{ start: 4, end: 8 }]);
    expect(next.context.sourceNotes).toBe(model.context.sourceNotes);
    expect(next.cards[0]).toMatchObject({ start: 0, duration: 4, bar: 1, beat: 1 });
    expect(next.cards[1]).toMatchObject({ start: 4, duration: 4, bar: 2, beat: 1 });
    expect(next.cards.map((card) => card.id)).not.toContain("card-1");
    expect(screenToSource(4, 8, removedBarsOf(next))).toEqual([{ start: 8, end: 12 }]);
    expect(sourceToScreen(8, removedBarsOf(next))).toBe(4);
    expect(out.label).toBe("2小節を消して詰めた");
    expect(out.message).toContain("Ctrl+Z");
  });

  it("closes up the segment numbers and drops the repeat count only where the length changed", () => {
    const model = fresh("plain-8");
    const next = cutBars(model, 2).model;
    const hit = model.segments.find((segment) => segment.startBar <= 2 && segment.endBar >= 2)!;
    const moved = next.segments.find((segment) => segment.id === hit.id)!;
    expect(moved).toMatchObject({ startBar: hit.startBar, endBar: hit.endBar - 1 });
    expect(moved.repeatCount).toBeUndefined();
    for (const segment of model.segments.filter((entry) => entry.startBar > 2)) {
      expect(next.segments.find((entry) => entry.id === segment.id)).toMatchObject({
        startBar: segment.startBar - 1,
        endBar: segment.endBar - 1,
        ...(segment.repeatCount ? { repeatCount: segment.repeatCount } : {}),
      });
    }
    expect(next.segments.every((segment) => segment.endBar <= Math.round(next.totalBeats / next.context.meter))).toBe(true);
  });

  it("keeps named segments and shifts them without rebuilding", () => {
    const model = fresh("stabs-8");
    expect(model.segments.map((segment) => segment.label)).toEqual(["区切り1", "区切り2"]);
    const next = cutBars(model, 2).model;
    expect(next.segments).toMatchObject([
      { id: "segment-0", startBar: 1, endBar: 3, label: "区切り1", source: "segmentSections" },
      { id: "segment-1", startBar: 4, endBar: 7, label: "区切り2", source: "segmentSections" },
    ]);
  });

  it("never removes the last bar", () => {
    const model = fresh("plain-8");
    const out = cutBars(model, 8);
    expect(out.changed).toBe(false);
    expect(out.message).toContain("最後の1小節");
    expect(cutBars(model, 7, 8).changed).toBe(false);
  });

  it("composes two cuts (the second bar is the bar that moved under it)", () => {
    const once = cutBars(fresh("plain-8"), 2).model;
    const twice = cutBars(once, 2).model;
    expect(removedBarsOf(twice)).toEqual([{ start: 4, end: 12 }]);
    expect(twice.totalBeats).toBe(24);
    expect(twice.cards).toHaveLength(6);
    expect(twice.cards[1]).toMatchObject({ start: 4, duration: 4, bar: 2, beat: 1 });
    expect(screenToSource(4, 8, removedBarsOf(twice))).toEqual([{ start: 12, end: 16 }]);
  });

  it("keeps each note's used state when a card only moves left", () => {
    const input = inputs.get("melody-track-8") ?? analyzeScenario(p10Scenario("melody-track-8"));
    inputs.set("melody-track-8", input);
    const model = buildCorrectionModel(input, reviewThresholds);
    // The card on bar 2 (beats 4–8) becomes the first card after cutting bar 1.
    const before = model.notes.filter((note) => note.cardId === "card-2");
    const target = before.find((note) => note.used)!;
    const edited = deleteNotes(model, [target.id]).model;
    const next = cutBars(edited, 1).model;
    const after = next.notes.filter((note) => note.cardId === "card-2");
    expect(next.cards[0]!.id).toBe("card-2");
    expect(after.find((note) => note.sourceNoteId === target.sourceNoteId)?.used).toBe(false);
    for (const note of before.filter((entry) => entry.sourceNoteId !== target.sourceNoteId)) {
      expect(after.find((entry) => entry.sourceNoteId === note.sourceNoteId)?.used, note.sourceNoteId ?? "").toBe(note.used);
    }
  });

  it("absorbs a piece shorter than ¼ beat into its neighbour", () => {
    const base = fresh("plain-8");
    const model = modelWith(base, [
      { id: "a", start: 0, duration: 3.9 },
      { id: "b", start: 3.9, duration: 0.2 },
      { id: "c", start: 4.1, duration: 3.9 },
      { id: "d", start: 8, duration: 4 },
    ], [{ id: "s", pitch: 60, start: 0, end: 12 }], 12);
    const out = cutBars(model, 2);
    expect(out.changed).toBe(true);
    expect(out.model.cards.map((card) => [card.id, card.start, card.duration])).toEqual([["a", 0, 4], ["d", 4, 4]]);
    expect(out.model.totalBeats).toBe(8);
    expect(out.model.notes.filter((note) => note.cardId === "a")).toHaveLength(1);
    expect(out.model.notes.find((note) => note.cardId === "a")).toMatchObject({ start: 0, duration: 4 });
  });

  it("takes a card that spans the cut from both source ranges and joins the pieces on screen", () => {
    const base = fresh("plain-8");
    const model = modelWith(base, [{ id: "long", start: 0, duration: 12 }], [{ id: "n", pitch: 60, start: 0, end: 12 }], 16);
    const out = cutBars(model, 2).model;
    expect(out.cards).toHaveLength(1);
    expect(out.cards[0]).toMatchObject({ start: 0, duration: 8 });
    expect(out.totalBeats).toBe(12);
    expect(cardSourceRanges(out, out.cards[0]!)).toEqual([{ start: 0, end: 4 }, { start: 8, end: 12 }]);
    const pieces = out.notes.filter((note) => note.cardId === "long");
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({ sourceNoteId: "n", start: 0, duration: 8, used: false });
  });

  it("saves a range after the cut at its original position and does not call it edited", () => {
    const model = fresh("plain-8");
    const { input, context } = saveContext("plain-8");
    const next = cutBars(model, 2).model;
    const saved = buildSaveCandidate(next, { startBar: 3, endBar: 7 }, input.result.fullTimeline);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.crossesCut).toBe(false);
    expect(saved.sourceBars).toEqual({ startBar: 4, endBar: 8 });
    expect(saved.userEdited).toBe(false);
    const block = toSavedProgressionBlock(saved.candidate, input.result, context, { userEdited: saved.userEdited, removedBars: saved.removedBars });
    expect(block.sourceStartBeat).toBe(12);
    expect(block.sourceEndBeat).toBe(32);
    // The screen bars are still the saved progression's bars.
    expect(block.chords.map((item) => item.bar)).toEqual([3, 4, 5, 6, 7]);
    // A card that did not change reuses its analysis voicing (not a re-span rebuild).
    expect(saved.candidate.chords[0]!.voicingMemory?.sourceVoicing?.midiNotes)
      .toEqual(input.result.fullTimeline[3]!.voicingMemory?.sourceVoicing?.midiNotes);
  });

  it("leaves out the original position and the position-based voicing for a range that crosses a cut", () => {
    const model = fresh("plain-8");
    const { input, context } = saveContext("plain-8");
    const next = cutBars(model, 2).model;
    const saved = buildSaveCandidate(next, { startBar: 1, endBar: 7 }, input.result.fullTimeline);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.crossesCut).toBe(true);
    expect(saved.sourceBars).toBeUndefined();
    const candidate = {
      ...saved.candidate,
      events: undefined,
      chords: saved.candidate.chords.map((item, index) => index === 0 ? { ...item, voicingMemory: undefined } : item),
    };
    const block = toSavedProgressionBlock(candidate, input.result, context, { userEdited: saved.userEdited, removedBars: saved.removedBars });
    expect(block.sourceStartBeat).toBeUndefined();
    expect(block.sourceEndBeat).toBeUndefined();
    expect(block.chords[0]!.voicingMemory?.sourceVoicing).toBeUndefined();
  });

  it("extracts a voicing at the mapped source position when the range does not cross a cut", () => {
    const model = fresh("plain-8");
    const { input, context } = saveContext("plain-8");
    const next = cutBars(model, 2).model;
    const saved = buildSaveCandidate(next, { startBar: 3, endBar: 7 }, input.result.fullTimeline);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const candidate = {
      ...saved.candidate,
      events: undefined,
      chords: saved.candidate.chords.map((item, index) => index === 0 ? { ...item, voicingMemory: undefined } : item),
    };
    const block = toSavedProgressionBlock(candidate, input.result, context, { removedBars: saved.removedBars });
    expect(block.chords[0]!.voicingMemory?.sourceVoicing?.midiNotes)
      .toEqual(input.result.fullTimeline[3]!.voicingMemory?.sourceVoicing?.midiNotes);
  });

  it("keeps the detected (screen) positions on `original` and records the original position in the log/event/feedback", () => {
    const model = fresh("plain-8");
    const { input } = saveContext("plain-8");
    const timeline = input.result.fullTimeline;
    const renamed = chooseName(model, model.cards[2]!.id, { ...model.cards[2]!.name, label: "Am7" }, "typed").model;
    const before = buildSaveCandidate(renamed, { startBar: 3, endBar: 3 }, timeline);
    expect(before.ok).toBe(true);
    if (!before.ok) return;
    const beforeEdits = before.editable.slots.map((slot) => slot.editSource);
    const beforeQuick = before.editable.slots.map((slot) => slot.quickCandidateSelection);
    const beforeEvents = buildCorrectionEvents(before.original, before.candidate, input.result, beforeEdits, beforeQuick);
    const beforeLogs = buildLabelCorrectionLogs(before.original, before.editable, input.result, { occurredAt: "2026-01-01T00:00:00.000Z" });
    const beforeFeedback = buildProgressionSaveFeedbackEvent(before.original, before.candidate, input.result, beforeEdits, {
      occurredAt: "2026-01-01T00:00:00.000Z", userEdited: true, userVerified: false,
    });
    expect(beforeEvents[0]!.segment).toEqual({ startBeat: 8, endBeat: 12 });

    const cutRenamed = cutBars(renamed, 2).model;
    const after = buildSaveCandidate(cutRenamed, { startBar: 2, endBar: 2 }, timeline);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    // The premise: `original` is built from the cards' screen bars (the clip stays valid).
    expect(after.original.chords[0]).toMatchObject({ bar: 2, beat: 1, durationBeats: 4 });
    const afterEdits = after.editable.slots.map((slot) => slot.editSource);
    const afterQuick = after.editable.slots.map((slot) => slot.quickCandidateSelection);
    const afterEvents = buildCorrectionEvents(after.original, after.candidate, input.result, afterEdits, afterQuick, after.removedBars);
    const afterLogs = buildLabelCorrectionLogs(after.original, after.editable, input.result, {
      occurredAt: "2026-01-01T00:00:00.000Z",
      removedBars: after.removedBars,
    });
    const afterFeedback = buildProgressionSaveFeedbackEvent(after.original, after.candidate, input.result, afterEdits, {
      occurredAt: "2026-01-01T00:00:00.000Z", userEdited: true, userVerified: false, removedBars: after.removedBars,
    });
    expect(afterEvents[0]!.segment).toEqual({ startBeat: 8, endBeat: 12 });
    expect(afterLogs[0]!.eventFingerprint).toBe(beforeLogs[0]!.eventFingerprint);
    expect(afterLogs[0]!.noteSnapshotHash).toBe(beforeLogs[0]!.noteSnapshotHash);
    expect(afterFeedback!.range).toEqual({ startBeat: 8, endBeat: 12 });
    expect(afterFeedback!.range).toEqual(beforeFeedback!.range);
  });

  it("keeps the detected span for a chord that itself crosses a cut (two source ranges)", () => {
    const { input } = saveContext("plain-8");
    const base: ChordTimelineItem = input.result.fullTimeline[0]!;
    const detected: ChordTimelineItem = { ...base, bar: 1, beat: 1, durationBeats: 8 };
    const original = { chords: [detected] };
    const edited = { chords: [{ ...detected, chord: { ...detected.chord, label: "Am7" } }] };
    const removed = [{ start: 4, end: 8 }];
    const events = buildCorrectionEvents(original, edited, input.result, ["manual-label"], undefined, removed);
    expect(events[0]!.segment).toEqual({ startBeat: 0, endBeat: 8 });
    const feedback = buildProgressionSaveFeedbackEvent(original, edited, input.result, ["manual-label"], {
      occurredAt: "2026-01-01T00:00:00.000Z", userEdited: true, userVerified: false, removedBars: removed,
    });
    expect(feedback!.range).toEqual({ startBeat: 0, endBeat: 8 });
  });
});
