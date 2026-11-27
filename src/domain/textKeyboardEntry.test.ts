import { describe, expect, it } from "vitest";
import type { ChordSymbol } from "./types";
import {
  addKeyboardSlot,
  appendKeyboardBar,
  emptyKeyboardBar,
  flushKeyboardBar,
  followedSuggestionBeats,
  keyboardBarTokens,
  pendingKeyboardBarText,
  previousBarItems,
  type KeyboardBar,
  type KeyboardSlot,
} from "./textKeyboardEntry";
import { parseUnifiedText } from "./textUnified";

/** P24-06: a minimal chord symbol for the writer (the writer only reads the label). */
const chord = (label: string) => ({ label } as unknown as ChordSymbol);
const NOTE = { kind: "chord" as const, chord: chord("Cmaj7"), notes: [48, 52, 55, 59] };

interface Step {
  readonly label?: string;
  readonly beats: number;
}

/** The sounding length of every written chord: its cell plus the holds that follow it. */
function soundedChords(parsed: ReturnType<typeof parseUnifiedText>): Array<{ label: string; beats: number }> {
  const out: Array<{ label: string; beats: number }> = [];
  for (const slot of parsed.slots) {
    if (slot.kind === "rest") continue;
    if (slot.kind === "hold") {
      const last = out[out.length - 1];
      if (last !== undefined) last.beats += slot.durationBeats;
      continue;
    }
    out.push({ label: slot.raw, beats: slot.durationBeats });
  }
  return out;
}

/** Feeds the steps into bars and returns the text the added chords produce (stopping at an open bar). */
function write(steps: readonly (readonly Step[])[], beatsPerBar = 4): {
  text: string;
  bar: KeyboardBar;
  completed: string[];
} {
  let bar = emptyKeyboardBar();
  let text = "";
  const completed: string[] = [];
  for (const barSteps of steps) {
    for (const step of barSteps) {
      const slot: KeyboardSlot = step.label === undefined
        ? { kind: "rest", beats: step.beats }
        : { kind: "chord", beats: step.beats, chord: chord(step.label), notes: [...NOTE.notes] };
      const result = addKeyboardSlot(bar, slot, beatsPerBar);
      bar = result.bar;
      if (result.completed !== undefined) {
        completed.push(result.completed.tokens);
        text = appendKeyboardBar(text, result.completed.tokens);
        bar = emptyKeyboardBar();
      }
    }
  }
  return { text, bar, completed };
}

const steps = (...entries: readonly (number | [string, number])[]): Step[] =>
  entries.map((entry) => typeof entry === "number" ? { beats: entry } : { label: entry[0], beats: entry[1] });

describe("P24-06 writing the keyboard's chords as the score text", () => {
  it("writes the three examples of the design", () => {
    expect(write([steps(["Dm7", 4])]).completed[0]).toBe("Dm7");
    const three = write([steps(["Dm7", 4]), steps(["G7", 4]), steps(["Cmaj7", 2], ["Am7", 2])]);
    expect(three.completed[0]).toBe("Dm7");
    expect(three.text).toBe("| Dm7 | G7 | Cmaj7 Am7 |");
    expect(write([steps(["Cmaj7", 2], ["Am7", 1], ["Fmaj7", 1])]).text).toBe("| Cmaj7 = Am7 Fmaj7 |");
    expect(write([steps(2, ["C", 2])]).text).toBe("| _ _ C = |");
  });

  it("starts a new line after four bars and keeps the bar count of the last line", () => {
    const five = write([
      steps(["Cmaj7", 4]), steps(["Am7", 4]), steps(["Dm7", 4]), steps(["G7", 4]), steps(["Cmaj7", 4]),
    ]);
    expect(five.text).toBe("| Cmaj7 | Am7 | Dm7 | G7 |\n| Cmaj7 |");
  });

  it("fills the rest of an open bar with = (or _ after a rest) when the entry closes", () => {
    expect(flushKeyboardBar({ slots: [{ ...NOTE, beats: 2 }], filled: 2 }, 4)?.tokens).toBe("Cmaj7 = = =");
    expect(flushKeyboardBar({ slots: [{ kind: "rest", beats: 2 }, { ...NOTE, beats: 2 }], filled: 4 }, 4)?.tokens)
      .toBe("_ _ Cmaj7 =");
    expect(flushKeyboardBar({ slots: [{ ...NOTE, beats: 1 }], filled: 1 }, 4)?.tokens).toBe("Cmaj7 = = =");
    expect(flushKeyboardBar({ slots: [{ kind: "rest", beats: 1 }], filled: 1 }, 4)?.tokens).toBe("_ _ _ _");
    expect(flushKeyboardBar(emptyKeyboardBar(), 4)).toBeUndefined();
  });

  it("shows the open bar faintly after the text (the example's `| Cmaj7 …`)", () => {
    const { bar } = write([steps(["Cmaj7", 2])]);
    expect(pendingKeyboardBarText(bar, 4)).toBe("| Cmaj7 …");
    expect(pendingKeyboardBarText({ slots: [{ kind: "rest", beats: 2 }], filled: 2 }, 4)).toBe("| _ _ …");
    expect(pendingKeyboardBarText(emptyKeyboardBar(), 4)).toBeUndefined();
  });

  it("refuses a slot longer than the open bar, so the length buttons can be honest", () => {
    const bar: KeyboardBar = { slots: [{ ...NOTE, beats: 1 }], filled: 1 };
    const refused = addKeyboardSlot(bar, { ...NOTE, beats: 4 }, 4);
    expect(refused.bar).toBe(bar);
    expect(refused.completed).toBeUndefined();
    expect(addKeyboardSlot(bar, { ...NOTE, beats: 2 }, 4).bar.filled).toBe(3);
  });

  it("keeps the bars' own lengths in the tokens", () => {
    // A rest is `_` for every beat, so a bar with a rest takes the cell form.
    expect(keyboardBarTokens([{ ...NOTE, beats: 2 }, { kind: "rest", beats: 2 }], 4)).toBe("Cmaj7 = _ _");
    expect(keyboardBarTokens([{ ...NOTE, beats: 2 }, { kind: "rest", beats: 2 }], 4)).toContain("=");
    expect(keyboardBarTokens([{ kind: "rest", beats: 2 }, { ...NOTE, beats: 1 }, { kind: "rest", beats: 1 }], 4))
      .toBe("_ _ Cmaj7 _");
  });

  it("round-trips 24 length/rest combinations through the one grammar with the same chords and lengths", () => {
    const patterns: readonly (readonly (number | [string, number])[])[] = [
      [["Cmaj7", 4]],
      [["Cmaj7", 2], ["Am7", 2]],
      [["Cmaj7", 1], ["Am7", 1], ["Dm7", 1], ["G7", 1]],
      [["Cmaj7", 2], ["Am7", 1], ["Fmaj7", 1]],
      [["Cmaj7", 1], ["Am7", 2], ["Dm7", 1]],
      [["Cmaj7", 1], ["Am7", 1], ["Dm7", 2]],
      [2, ["Am7", 2]],
      [["Cmaj7", 2], 2],
      [["Cmaj7", 1], 1, ["Dm7", 1], 1],
      [1, ["Dm7", 1], ["G7", 1], ["Cmaj7", 1]],
      [["Cmaj7", 1], ["Am7", 1], 1, ["G7", 1]],
      [3, ["Cmaj7", 1]],
      [["Cmaj7", 1], 3],
    ];
    let checked = 0;
    for (let index = 0; index < 24; index += 1) {
      const first = patterns[index % patterns.length]!;
      const second = patterns[(index * 5 + 3) % patterns.length]!;
      const barSteps = [steps(...first), steps(...second)];
      const expected = barSteps.flat()
        .filter((entry) => entry.label !== undefined)
        .map((entry) => ({ label: entry.label!, beats: entry.beats }));
      const { text } = write(barSteps);
      const parsed = parseUnifiedText(text, { beat: "4/4" });
      expect(parsed.diagnostics.filter((entry) => entry.severity === "ERROR").map((entry) => entry.message), text)
        .toEqual([]);
      // A repeated chord merges into one span, so each written chord's own sounding length is the check.
      expect(soundedChords(parsed), text)
        .toEqual(expected.map((entry) => ({ label: entry.label, beats: entry.beats })));
      checked += 1;
    }
    expect(checked).toBe(24);
  });

  it("round-trips a 3/4 chart with the meter's own beats", () => {
    const { text } = write([steps(["Cmaj7", 3]), steps(["Am7", 1], ["Dm7", 2]), steps(1, ["G7", 2])], 3);
    const parsed = parseUnifiedText(text, { beat: "3/4" });
    expect(text).toBe("| Cmaj7 | Am7 Dm7 = | _ G7 = |");
    expect(soundedChords(parsed).map((entry) => [entry.label, entry.beats]))
      .toEqual([["Cmaj7", 3], ["Am7", 1], ["Dm7", 2], ["G7", 2]]);
  });
});

describe("P25 V26-3 the palette's starting length follows the bar before", () => {
  /** The lengths the palette would go through, adding a chord each time (a pick is not made). */
  function walk(text: string, beatsPerBar = 4, count = 5): number[] {
    const items = previousBarItems(parseUnifiedText(text, { beat: `${beatsPerBar}/4` }).slots);
    const lengths: number[] = [];
    let filled = 0;
    let current = beatsPerBar;
    for (let index = 0; index < count && filled < beatsPerBar; index += 1) {
      current = followedSuggestionBeats(items, beatsPerBar, filled, current);
      lengths.push(current);
      filled += current;
    }
    return lengths;
  }
  it("takes the shape of the bar before (4/4)", () => {
    expect(walk("| C |")).toEqual([4]);
    expect(walk("| C G |")).toEqual([2, 2]);
    expect(walk("| C = G F |")).toEqual([2, 1, 1]);
    expect(walk("| C G Am F |")).toEqual([1, 1, 1, 1]);
  });
  it("starts with one bar when the text is empty", () => {
    expect(followedSuggestionBeats(previousBarItems(parseUnifiedText("", {}).slots), 4, 0, 2)).toBe(4);
  });
  it("uses the longest length not longer than the chord, or stays where nothing starts (| C = = G |)", () => {
    expect(walk("| C = = G |")).toEqual([2, 2]);
  });
  it("reads 3/4: | C G = | gives 1 beat then 2 beats", () => {
    expect(walk("| C G = |", 3)).toEqual([1, 2]);
  });
  it("follows the last bar of the text", () => {
    expect(walk("| C | C G |")).toEqual([2, 2]);
  });
  it("shrinks the length to what is left when nothing starts at the open beat", () => {
    expect(followedSuggestionBeats([{ start: 0, beats: 4 }], 4, 2, 4)).toBe(2);
    expect(followedSuggestionBeats([{ start: 0, beats: 2 }], 4, 3, 2)).toBe(1);
  });
});
