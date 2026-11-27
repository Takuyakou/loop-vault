import { describe, expect, it } from "vitest";
import { chordIdentityKey, normalizeChordSymbol } from "../chordIdentity";
import { parseExtendedTextChordLabel } from "../extendedTextProgression";
import { parseUnifiedText } from "../textUnified";
import { planAppendNextChord } from "./appendPlan";

const added = (text: string, label = "G7") => {
  const plan = planAppendNextChord(text, label);
  expect(plan, `plan for ${JSON.stringify(text)}`).not.toBeNull();
  return plan!.nextText;
};
const bars = (text: string) => parseUnifiedText(text).bars.length;

describe("P25 V23 planAppendNextChord", () => {
  it("adds a whole bar to a one-chord-per-bar line", () => {
    expect(added("| Cmaj7 | Am7 |")).toBe("| Cmaj7 | Am7 | G7 |");
    expect(bars("| Cmaj7 | Am7 | G7 |")).toBe(bars("| Cmaj7 | Am7 |") + 1);
  });

  it("adds a whole bar after two chords in one bar", () => {
    expect(added("| Cmaj7 Am7 | Dm7 |")).toBe("| Cmaj7 Am7 | Dm7 | G7 |");
  });

  it("adds after a comma, dash or space separated line", () => {
    expect(added("C, Am, Dm")).toBe("C, Am, Dm, G7");
    expect(added("C-Am-Dm")).toBe("C-Am-Dm-G7");
    // A space line leaves the chord inside the open bar, so the transaction rejects it and the new line wins.
    expect(added("C Am Dm")).toBe("C Am Dm\n| G7 |");
  });

  it("keeps % and = and a rest in the earlier bars", () => {
    const percent = added("| Cmaj7 % |");
    expect(percent).toBe("| Cmaj7 % | G7 |");
    const hold = added("| Cmaj7 = |");
    expect(hold).toBe("| Cmaj7 = | G7 |");
    const rest = added("| Cmaj7 | _ |");
    expect(rest).toBe("| Cmaj7 | _ | G7 |");
  });

  it("adds a new code line after a lyric chord line and keeps the lyrics untouched", () => {
    expect(added("[C]hello [G]world")).toBe("[C]hello [G]world\n| G7 |");
  });

  it("keeps a trailing comment and the > marker after the last code line", () => {
    const text = "| Cmaj7 | Am7 |\n# outro\n>";
    expect(added(text)).toBe("| Cmaj7 | Am7 | G7 |\n# outro\n>");
  });

  it("refuses an unreadable chart and leaves the input alone", () => {
    expect(planAppendNextChord("| Cmaj7 | ??? |", "G7")).toBeNull();
    expect(planAppendNextChord("", "G7")).toBeNull();
    expect(planAppendNextChord("| Cmaj7 |", "not-a-chord")).toBeNull();
  });

  it("does not change the earlier attacks, and the added chord is one bar at the end", () => {
    const text = "| Cmaj7 Am7 | Dm7 G7 |";
    const before = parseUnifiedText(text);
    const next = parseUnifiedText(added(text, "Cmaj7"));
    expect(next.bars.length).toBe(before.bars.length + 1);
    const label = parseExtendedTextChordLabel("Cmaj7")!;
    expect(chordIdentityKey(normalizeChordSymbol(label))).toBe(chordIdentityKey(normalizeChordSymbol(parseExtendedTextChordLabel(next.bars[next.bars.length - 1]![0]!)!)));
    for (let index = 0; index < before.bars.length; index += 1) expect(next.bars[index]).toEqual(before.bars[index]);
  });
});
