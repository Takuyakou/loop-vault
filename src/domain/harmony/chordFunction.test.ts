import { describe, expect, it } from "vitest";
import { progressionFunctions, type FunctionChordInput, type FunctionKey } from "./chordFunction";

const C: FunctionKey = { tonicPc: 0, mode: "major" };
const chord = (rootPc: number, quality: string, extra: Partial<FunctionChordInput> = {}): FunctionChordInput => ({ rootPc, quality, ...extra });
const kinds = (chords: readonly FunctionChordInput[], key: FunctionKey | undefined) => progressionFunctions(chords, key).map((result) => result.kind);
const dotted = (chords: readonly FunctionChordInput[], key: FunctionKey | undefined) => progressionFunctions(chords, key).map((result) => result.borrowedDominant);

describe("chord functions", () => {
  it("finds T / SD / SDm / D in C major", () => {
    expect(kinds([chord(2, "min7"), chord(7, "dom7"), chord(0, "maj7")], C)).toEqual(["SD", "D", "T"]);
    expect(kinds([chord(5, "maj7"), chord(7, "dom7"), chord(4, "min7"), chord(9, "min7")], C)).toEqual(["SD", "D", "T", "T"]);
    expect(kinds([chord(0, "maj7"), chord(9, "dom7"), chord(2, "min7"), chord(7, "dom7")], C)).toEqual(["T", "D", "SD", "D"]);
    expect(dotted([chord(0, "maj7"), chord(9, "dom7"), chord(2, "min7"), chord(7, "dom7")], C)).toEqual([false, true, false, false]);
    expect(kinds([chord(5, "maj7"), chord(5, "min7"), chord(0, "maj7")], C)).toEqual(["SD", "SDm", "T"]);
    expect(kinds([chord(2, "min7"), chord(1, "dom7"), chord(0, "maj7")], C)).toEqual(["SD", "D", "T"]);
    expect(dotted([chord(2, "min7"), chord(1, "dom7"), chord(0, "maj7")], C)).toEqual([false, true, false]);
  });

  it("finds the A minor cadence", () => {
    const A: FunctionKey = { tonicPc: 9, mode: "minor" };
    expect(kinds([chord(11, "min7b5"), chord(4, "dom7"), chord(9, "min7")], A)).toEqual(["SD", "D", "T"]);
  });

  it("transposes the same functions to every key", () => {
    const base: Array<[number, string]> = [[2, "min7"], [7, "dom7"], [0, "maj7"], [9, "dom7"]];
    const expected = ["SD", "D", "T", ""];
    const dottedExpected = [false, false, false, false];
    for (let tonic = 0; tonic < 12; tonic += 1) {
      const key: FunctionKey = { tonicPc: tonic, mode: "major" };
      const chords = base.map(([pc, quality]) => chord((pc + tonic) % 12, quality));
      expect(kinds(chords, key)).toEqual(expected);
      expect(dotted(chords, key)).toEqual(dottedExpected);
    }
  });

  it("uses no colour without a key", () => {
    expect(progressionFunctions([chord(2, "min7"), chord(7, "dom7")], undefined).every((result) => result.kind === "" && !result.borrowedDominant)).toBe(true);
  });

  it("does not read the last chord against the first", () => {
    expect(kinds([chord(0, "maj7"), chord(2, "min7"), chord(9, "dom7")], C)).toEqual(["T", "SD", ""]);
  });

  it("does not connect across a key change", () => {
    const eFlat: FunctionKey = { tonicPc: 3, mode: "major" };
    const chords = [chord(2, "min7"), chord(7, "dom7"), chord(0, "maj7"), chord(5, "min7", { key: eFlat }), chord(10, "dom7", { key: eFlat }), chord(3, "maj7", { key: eFlat })];
    expect(kinds(chords, C)).toEqual(["SD", "D", "T", "SD", "D", "T"]);
  });

  it("keeps a bass-slash dominant like the ear practice", () => {
    expect(kinds([chord(2, "min7", { bassPc: 7 })], C)).toEqual(["D"]);
  });
});
