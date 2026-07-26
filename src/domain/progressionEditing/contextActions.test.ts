import { describe, expect, it } from "vitest";
import type { ChordSymbol, ProgressionBlockCandidate } from "../types";
import {
  canDeleteEditableChordWithMode,
  createEditableProgression,
  deleteEditableChordWithMode,
  undoProgressionEdit,
} from "./index";

function chord(root: number, label: string): ChordSymbol {
  return { root, quality: "maj", tensions: [], label };
}

function editable() {
  const candidate: ProgressionBlockCandidate = {
    id: "context",
    startBar: 1,
    endBar: 2,
    lengthBars: 2,
    summaryText: "C - F - G",
    confidence: 0.9,
    labels: [],
    warnings: [],
    chords: [
      item("c", 1, 1, 2, chord(0, "C")),
      item("f", 1, 3, 2, chord(5, "F")),
      item("g", 2, 1, 4, chord(7, "G")),
    ],
  };
  return createEditableProgression(candidate);
}

function item(
  eventId: string,
  bar: number,
  beat: number,
  durationBeats: number,
  value: ChordSymbol,
) {
  return {
    eventId,
    bar,
    beat,
    durationBeats,
    chord: value,
    confidence: 0.9,
    alternatives: [],
    warnings: [],
  };
}

describe("explicit chord delete semantics", () => {
  it("extends the previous chord and restores the full snapshot on undo", () => {
    const before = editable();
    const after = deleteEditableChordWithMode(before, "f", "extend-previous");

    expect(after.slots.map((slot) => [slot.id, slot.position.durationBeats]))
      .toEqual([["c", 4], ["g", 4]]);
    expect(undoProgressionEdit(after).slots).toEqual(before.slots);
  });

  it("extends the next chord from the deleted chord's start", () => {
    const after = deleteEditableChordWithMode(editable(), "f", "extend-next");

    expect(after.slots.map((slot) => [
      slot.id,
      slot.position.bar,
      slot.position.beat,
      slot.position.durationBeats,
    ])).toEqual([
      ["c", 1, 1, 2],
      ["g", 1, 3, 6],
    ]);
  });

  it("closes the gap by shifting every following chord earlier", () => {
    const after = deleteEditableChordWithMode(editable(), "f", "close-gap");

    expect(after.slots.map((slot) => [
      slot.id,
      slot.position.bar,
      slot.position.beat,
      slot.position.durationBeats,
    ])).toEqual([
      ["c", 1, 1, 2],
      ["g", 1, 3, 4],
    ]);
  });

  it("replaces a chord with N.C. and removes its voicing and alternatives", () => {
    const before = editable();
    before.slots[1]!.voicingMemory = {
      sourceVoicing: {
        schemaVersion: 1,
        source: "midi-extracted",
        representation: "simultaneous-voicing",
        midiNotes: [53, 57, 60],
        capturedForChordKey: "5:maj:-:-",
      },
    };
    const after = deleteEditableChordWithMode(before, "f", "replace-no-chord");

    expect(after.slots[1]).toMatchObject({
      id: "f",
      currentChord: { label: "N.C." },
      alternatives: [],
      voicingMemory: undefined,
    });
    expect(undoProgressionEdit(after).slots).toEqual(before.slots);
  });

  it("disables impossible edge and single-event delete modes", () => {
    const base = editable();
    expect(canDeleteEditableChordWithMode(base, "c", "extend-previous")).toBe(false);
    expect(canDeleteEditableChordWithMode(base, "g", "extend-next")).toBe(false);
    const single = { ...base, slots: [base.slots[0]!] };
    expect(canDeleteEditableChordWithMode(single, "c", "close-gap")).toBe(false);
    expect(canDeleteEditableChordWithMode(single, "c", "replace-no-chord")).toBe(true);
  });
});
