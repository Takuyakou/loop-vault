import { describe, expect, it } from "vitest";
import { answerListenNotes } from "./earPlayback";

/**
 * P23-23a S5/S6/C2: what the two new ways of listening sound.
 * The screen calls these with the answer of the card; here the notes themselves are pinned down.
 */
describe("the bass alone and the notes spread out (P23-23a S5/S6)", () => {
  const cmaj7 = [48, 52, 55, 59];
  const chordBeats = 2.4;

  it("bass sounds the one lowest note, as long as the chord", () => {
    const { notes, endBeat } = answerListenNotes(cmaj7, "bass", { chordBeats });
    expect(notes).toEqual([{ pitch: 48, startBeat: 0, durationBeats: chordBeats, velocity: 90 }]);
    expect(endBeat).toBe(chordBeats);
  });

  it("spread sounds the notes one at a time from the lowest, a beat apart", () => {
    const { notes, endBeat } = answerListenNotes(cmaj7, "spread", { chordBeats });
    expect(notes.map((note) => note.pitch)).toEqual([48, 52, 55, 59]);
    expect(notes.map((note) => note.startBeat)).toEqual([0, 1, 2, 3]);
    expect(notes.every((note) => note.durationBeats === 0.95)).toBe(true);
    expect(endBeat).toBe(4);
  });

  it("spread starts from the lowest even when the answer is written from the top", () => {
    const { notes } = answerListenNotes([59, 55, 52, 48], "spread", { chordBeats });
    expect(notes.map((note) => note.pitch)).toEqual([48, 52, 55, 59]);
  });
});
