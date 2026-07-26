import { describe, expect, it } from "vitest";
import type { VoicingSnapshot } from "../types";
import {
  createEditableProgression,
  mergeEditableChords,
  hasProgressionEdits,
  replaceEditableChord,
  setEditableVoicingMemory,
  splitEditableChord,
  undoProgressionEdit,
} from "./index";
import { gMajor, makeCandidate } from "./testFixtures";

const memory: VoicingSnapshot = {
  schemaVersion: 1,
  source: "midi-extracted",
  representation: "simultaneous-voicing",
  midiNotes: [48, 52, 55],
  bassNote: 48,
  capturedForChordKey: "0:maj:-:-",
};

describe("voicing event identity", () => {
  it("keeps memory on replacement and marks compatibility dynamically", () => {
    const editable = createEditableProgression({
      ...makeCandidate(),
      chords: makeCandidate().chords.map((item, index) => index === 0
        ? { ...item, eventId: "event-one", voicingMemory: { sourceVoicing: memory } }
        : item),
    });
    expect(editable.slots[0]?.id).toBe("event-one");
    expect(editable.slots[0]?.voicingMemory?.sourceVoicing).toEqual(memory);
  });

  it("copies the first event's memory to both split events, then restores on undo", () => {
    const base = createEditableProgression(makeCandidate());
    const withMemory = setEditableVoicingMemory(base, base.slots[0]!.id, { sourceVoicing: memory });
    expect(hasProgressionEdits(withMemory)).toBe(true);
    const split = splitEditableChord(withMemory, withMemory.slots[0]!.id);
    expect(split.slots[0]?.id).toBe(withMemory.slots[0]?.id);
    expect(split.slots[0]?.voicingMemory?.sourceVoicing).toEqual(memory);
    expect(split.slots[1]?.voicingMemory?.sourceVoicing).toEqual(memory);
    expect(undoProgressionEdit(split).slots).toEqual(withMemory.slots);
  });

  it("keeps the selected surviving event and memory on merge", () => {
    const base = createEditableProgression(makeCandidate());
    const withMemory = setEditableVoicingMemory(base, base.slots[1]!.id, { practiceVoicingOverride: memory });
    const merged = mergeEditableChords(
      withMemory,
      withMemory.slots[0]!.id,
      withMemory.slots[1]!.id,
      "second",
    );
    expect(merged.slots[0]?.id).toBe(withMemory.slots[1]?.id);
    expect(merged.slots[0]?.voicingMemory?.practiceVoicingOverride).toEqual(memory);
  });

  it("drops a voicing when a chord replacement makes it stale", () => {
    const base = createEditableProgression(makeCandidate());
    const withMemory = setEditableVoicingMemory(base, base.slots[0]!.id, {
      sourceVoicing: memory,
    });
    const replaced = replaceEditableChord(
      withMemory,
      withMemory.slots[0]!.id,
      gMajor,
      "alternative",
    );

    expect(replaced.slots[0]?.voicingMemory).toBeUndefined();
    expect(undoProgressionEdit(replaced).slots).toEqual(withMemory.slots);
  });
});
