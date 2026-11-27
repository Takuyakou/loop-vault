import { describe, expect, it } from "vitest";
import { dockNoteName } from "./dockNoteSpelling";

const pcs = (...values: number[]) => new Set(values.map((value) => ((value % 12) + 12) % 12));

describe("P25 V24-10 dock note spelling", () => {
  it("spells C major's Em7 rootless B as D4 · F♯4 · G4 · B4", () => {
    expect([62, 66, 67, 71].map((note) => dockNoteName(note, "E", "C major", pcs(4, 7, 11, 2)))).toEqual(["D4", "F♯4", "G4", "B4"]);
  });

  it("spells F major's C7 with B♭", () => {
    expect([60, 64, 67, 70].map((note) => dockNoteName(note, "C", "F major", pcs(0, 4, 7, 10)))).toEqual(["C4", "E4", "G4", "B♭4"]);
  });

  it("spells A♭maj7 as A♭ · C · E♭ · G", () => {
    expect([68, 72, 75, 79].map((note) => dockNoteName(note, "A♭", "A♭ major", pcs(8, 0, 3, 7)))).toEqual(["A♭4", "C5", "E♭5", "G5"]);
  });

  it("V25-2: a tension takes its letter from the chord's degree, not from the key", () => {
    // F major, Em7 rootless B: D · F♯ · G · B (the 9th is F♯, G is the third).
    expect([62, 66, 67, 71].map((note) => dockNoteName(note, "E", "F major", pcs(4, 7, 11, 2)))).toEqual(["D4", "F♯4", "G4", "B4"]);
    // C major, Cm7♭5: C · E♭ · G♭ · B♭.
    expect([60, 63, 66, 70].map((note) => dockNoteName(note, "C", "C major", pcs(0, 3, 6, 10)))).toEqual(["C4", "E♭4", "G♭4", "B♭4"]);
    // C7(♯9): the ♯9 is D♯ (not E♭), with or without the 9th among the chord's notes.
    expect(dockNoteName(63, "C", "C major", pcs(0, 4, 7, 10))).toBe("D♯4");
  });

  it("falls back to the key direction only when the root cannot be read", () => {
    expect(dockNoteName(61, "?", "F major", pcs(0, 4, 7))).toBe("D♭4");
    expect(dockNoteName(61, "?", "G major", pcs(0, 4, 7))).toBe("C♯4");
  });
});
