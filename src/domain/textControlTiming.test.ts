import { describe, expect, it } from "vitest";
import { evaluateTextProgressionCapabilities, parseTextProgression } from "./textProgression";
import { buildProgressionVoicingPracticeSnapshot } from "./progressionVoicingPractice/snapshot";
import { createProgressionPracticeClockState, projectProgressionPracticeClock, reduceProgressionPracticeClock } from "./progressionVoicingPractice/clock";
import { createTextProgressionDraft, textProgressionTimeline } from "./textProgressionDraft";
import { validateDraft } from "./midi/manualDraftEditing";
import type { SavedProgressionBlock } from "./types";

function snapshot(text: string) {
  const parsed = parseTextProgression(text);
  expect(parsed.canConvert).toBe(true);
  const block: SavedProgressionBlock = {
    id: "controls", summaryText: "Synthetic controls", chords: textProgressionTimeline(parsed),
    startBar: 1, endBar: parsed.bars, lengthBars: parsed.bars, sourceStartBeat: 0,
    sourceEndBeat: parsed.scoreLengthBeats, bpm: 120, timeSignature: "4/4",
    tags: [], capturedAt: "2026-09-14T00:00:00.000Z", analyzerVersion: "text-progression-v1",
  };
  const result = buildProgressionVoicingPracticeSnapshot({ block, selection: "basic-full",
    sourceReference: { ideaId: "idea", blockId: block.id } });
  if (!result.ok) throw new Error(result.error.code);
  return result.snapshot;
}

describe("P5.31 control timing", () => {
  it("allows an all-rest Text Draft in the actual editor save gate, never an empty MIDI or invalid extent", () => {
    const draft = createTextProgressionDraft({ result: parseTextProgression("| _ | _ |"),
      now: "2026-09-14T00:00:00.000Z" });
    expect(validateDraft(draft)).toEqual({ errors: [], warnings: [], canSave: true });
    expect(validateDraft({ ...draft, source: { type: "manual-range" } }).canSave).toBe(false);
    expect(validateDraft({ ...draft, source: { type: "automatic-candidate", candidateId: "synthetic" } }).canSave).toBe(false);
    for (const lengthBars of [0, -1, 1.5, 33, NaN, Infinity]) {
      expect(validateDraft({ ...draft, lengthBars }).canSave).toBe(false);
    }
    expect(validateDraft({ ...draft, beatsPerBar: 3 }).canSave).toBe(false);
    expect(validateDraft({ ...draft, selectedRange: { ...draft.selectedRange, endBar: 3 } }).canSave).toBe(false);
    expect(validateDraft({ ...draft, selectedRange: { ...draft.selectedRange, startBeat: 2 } }).canSave).toBe(false);
  });
  it("uses cells rather than attacks for allocation, repeats after rest, and extends across bars without attacking", () => {
    const parsed = parseTextProgression("| E7%_Am7 | =G |");
    expect(parsed.canConvert).toBe(true);
    expect(parsed.events.map(e => [e.canonical, (e.bar - 1) * 4 + e.startBeat - 1, e.durationBeats]))
      .toEqual([["E7", 0, 1], ["E7", 1, 1], ["Am7", 3, 3], ["G", 6, 2]]);
    expect(parseTextProgression("| C _ | % = |").events.map(e => [e.canonical, e.durationBeats]))
      .toEqual([["C", 2], ["C", 4]]);
    expect(parseTextProgression("| C | = | = |").events.map(e => e.durationBeats)).toEqual([12]);
    expect(parseTextProgression("| _ |").events).toEqual([]);
    const capabilities = evaluateTextProgressionCapabilities({ result: parseTextProgression("| _ |") });
    expect(capabilities.find(value => value.name === "vault-save")?.status).toBe("supported");
    expect(capabilities.find(value => value.name === "chord-dojo")?.status).toBe("unsupported");
    expect(capabilities.find(value => value.name === "voicing-memory")?.status).toBe("unsupported");
  });

  it("fails closed on missing previous identity, hold after rest, three cells and timing-free fake holds", () => {
    for (const text of ["| % |", "| = |", "| C _ = G |", "| C _ = |", "| C == |"]) {
      const parsed = parseTextProgression(text);
      expect(parsed.canConvert, text).toBe(false);
      expect(parsed.diagnostics.length, text).toBeGreaterThan(0);
    }
  });

  it("projects honest Current/Next/rest and every boundary from the single transport beat", () => {
    const source = snapshot("| E7%_Am7 | =G |");
    let state = reduceProgressionPracticeClock(source, createProgressionPracticeClockState(source, { countInBars: 0 }), { type: "START" });
    const expected = [
      [0, 0, 1, false, 0], [1, 1, -1, false, 0], [2, -1, 2, true, 0],
      [3, 2, 3, false, 0], [5, 2, 3, false, 0], [6, 3, 0, false, 0],
      [8, 0, 1, false, 1],
    ] as const;
    for (const [beat, currentEventIndex, nextEventIndex, isRest, loopCount] of expected) {
      state = reduceProgressionPracticeClock(source, state, { type: "SYNC_TRANSPORT", absoluteBeat: beat });
      expect(projectProgressionPracticeClock(source, state)).toMatchObject({ currentEventIndex, nextEventIndex, isRest, loopCount });
    }
  });

  it("preserves rest position on pause/resume and BPM edits, resets on restart, and loops all-rest without a fake chord", () => {
    for (const text of ["| E7%_Am7 | =G |", "| _ | _ |"]) {
      const source = snapshot(text);
      let state = reduceProgressionPracticeClock(source, createProgressionPracticeClockState(source, { countInBars: 0 }), { type: "START" });
      state = reduceProgressionPracticeClock(source, state, { type: "SYNC_TRANSPORT", absoluteBeat: 2.5 });
      const before = projectProgressionPracticeClock(source, state);
      expect(before.isRest).toBe(true);
      state = reduceProgressionPracticeClock(source, state, { type: "PAUSE" });
      state = reduceProgressionPracticeClock(source, state, { type: "SET_BPM", bpm: 80 });
      state = reduceProgressionPracticeClock(source, state, { type: "RESUME" });
      expect(projectProgressionPracticeClock(source, state)).toEqual(before);
      state = reduceProgressionPracticeClock(source, state, { type: "SYNC_TRANSPORT", absoluteBeat: 8.5 });
      expect(projectProgressionPracticeClock(source, state).loopCount).toBe(1);
      state = reduceProgressionPracticeClock(source, state, { type: "RESTART" });
      expect(projectProgressionPracticeClock(source, state).progressionBeat).toBe(0);
      state = reduceProgressionPracticeClock(source, state, { type: "STOP" });
      expect(state.status).toBe("stopped");
    }
  });

  it("is deterministic without mutating parsed or saved musical events", () => {
    const text = "| _ C | = _ |";
    expect(snapshot(text)).toEqual(snapshot(text));
    expect(parseTextProgression(text)).toEqual(parseTextProgression(text));
  });

  it("keeps one-sided legacy bounds on the original contiguous-event path", () => {
    const chords = textProgressionTimeline(parseTextProgression("| Cmaj7 | G7 |"))
      .map(event => ({ ...event, bar: event.bar + 18 }));
    for (const bounds of [{ sourceStartBeat: 72 }, { sourceEndBeat: 80 }]) {
      const block: SavedProgressionBlock = {
        id: "legacy", summaryText: "Synthetic legacy", chords, ...bounds,
        startBar: 19, endBar: 20, lengthBars: 2, bpm: 120, timeSignature: "4/4",
        tags: [], capturedAt: "2026-09-14T00:00:00.000Z", analyzerVersion: "synthetic",
      };
      const result = buildProgressionVoicingPracticeSnapshot({ block, selection: "basic-full",
        sourceReference: { ideaId: "idea", blockId: block.id } });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.code);
      expect(result.snapshot.events.map(event => event.startBeat)).toEqual([0, 4]);
      expect(result.snapshot.lengthBeats).toBe(8);
    }
  });
});
