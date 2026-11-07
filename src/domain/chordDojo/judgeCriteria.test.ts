import { describe, expect, it } from "vitest";
import { parseChordLabel } from "../chords";
import { ChordEntry, judgeChord, requiredCount, type Target } from "./judging";

/**
 * P5.26.2-03 §4: what counts as "right" in Chord Dojo, pinned as the behaviour that exists today.
 * (The package's table and this one differ in places; the report lists them for a decision.)
 */
const chord = parseChordLabel("Cmaj7")!;
const target = (judge: Target["judge"], notes: number[]): Target => ({ notes, chord, judge, bass: "self" });
const CMAJ7 = [48, 55, 59, 64]; // C3 G3 B3 E4

describe("composition (pitch classes only): inversion, octave and doubling are all fine", () => {
  const t = target("composition", CMAJ7);
  it("accepts an inversion, other octaves and a doubled note", () => {
    expect(judgeChord(t, [64, 67, 71, 72]).ok).toBe(true); // E G B C
    expect(judgeChord(t, [36, 43, 47, 52]).ok).toBe(true); // all an octave down
    expect(judgeChord(t, [48, 60, 55, 59, 64]).ok).toBe(true); // C doubled
  });
  it("rejects another chord, a missing tone and an extra tone", () => {
    expect(judgeChord(t, [48, 52, 55, 58]).ok).toBe(false); // C7
    expect(judgeChord(t, [48, 55, 59]).ok).toBe(false);
    expect(judgeChord(t, [...CMAJ7, 62]).ok).toBe(false); // + D
  });
});

describe("exact (a registered voicing): the same pitches, octave included", () => {
  const t = target("exact", CMAJ7);
  it("accepts the same notes in any press order", () => {
    expect(judgeChord(t, [64, 48, 59, 55]).ok).toBe(true);
  });
  it("rejects the right notes in another octave, saying the register is wrong", () => {
    const wrong = judgeChord(t, CMAJ7.map((note) => note + 12));
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toContain("音域");
  });
});

describe("shape: the whole shape may move by octaves, its inside may not change", () => {
  const t = target("shape", CMAJ7);
  it("accepts the shape an octave away", () => {
    expect(judgeChord(t, CMAJ7.map((note) => note + 12)).ok).toBe(true);
  });
  it("rejects a re-ordered upper voicing and a wrong bottom note", () => {
    expect(judgeChord(t, [48, 59, 64, 67]).ok).toBe(false); // another inversion over C
    expect(judgeChord(t, [52, 55, 59, 60]).ok).toBe(false); // E in the bass
  });
});

describe("one extra note is a miss, in every kind", () => {
  it.each(["composition", "exact", "shape"] as const)("%s", (judge) => {
    expect(judgeChord(target(judge, CMAJ7), [...CMAJ7, 61]).ok).toBe(false);
  });
});

describe("the entry window (ChordEntry): settle time after the last needed note", () => {
  const needed = requiredCount(target("composition", CMAJ7));
  it("is judged only once settleMs has passed since the note that completed the chord", () => {
    const entry = new ChordEntry(needed, 250);
    [48, 55, 59].forEach((note, index) => entry.event(0, note, true, index * 10));
    entry.event(0, 64, true, 100); // completes the chord at t=100
    expect(entry.poll(100 + 249)).toBeUndefined();
    expect(entry.poll(100 + 250)?.notes).toEqual([48, 55, 59, 64]);
  });

  it("a mistouch let go before the chord is complete is not part of the answer", () => {
    const entry = new ChordEntry(needed, 60);
    entry.event(0, 61, true, 0);
    entry.event(0, 61, false, 30);
    [48, 55, 59, 64].forEach((note, index) => entry.event(0, note, true, 100 + index * 10));
    expect(entry.poll(1000)?.notes).toEqual([48, 55, 59, 64]);
  });

  it("an extra note still held when the chord completes is part of the answer (and a miss)", () => {
    const entry = new ChordEntry(needed, 60);
    entry.event(0, 61, true, 0);
    [48, 55, 59, 64].forEach((note, index) => entry.event(0, note, true, 100 + index * 10));
    const response = entry.poll(1000)!;
    expect(judgeChord(target("composition", CMAJ7), response.notes).ok).toBe(false);
  });
});
