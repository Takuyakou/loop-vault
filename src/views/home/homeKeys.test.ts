import { describe, expect, it } from "vitest";
import { makeIdea } from "../../domain/testFactory";
import type { SavedProgressionBlock } from "../../domain/types";
import { initialKey, keyTonic, keyWheel, parseHomeKey, WHEEL_NAMES } from "./homeKeys";
import type { HomeProgression } from "./useHomeSummary";

function entry(id: string, key: string | undefined, touchedAt = 0): HomeProgression {
  const block = { id, chords: [], detectedKey: key, tags: [], capturedAt: new Date(touchedAt).toISOString(), summaryText: id, analyzerVersion: "t" } as unknown as SavedProgressionBlock;
  return { id: `idea:${id}`, idea: makeIdea({ id: "idea", key: undefined, progressionBlocks: [block] }), block, touchedAt };
}

describe("the Home's key wheel (P23-09 D3–D6)", () => {
  it("D5: reads the saved key spellings, a key-less or unreadable one is not counted", () => {
    expect(parseHomeKey("C major")).toEqual({ slot: 0, mode: "major" });
    expect(parseHomeKey("C")).toEqual({ slot: 0, mode: "major" });
    expect(parseHomeKey("Eb major")).toEqual({ slot: 9, mode: "major" });
    expect(parseHomeKey("F# minor")).toEqual({ slot: 3, mode: "minor" });
    expect(parseHomeKey("A minor")).toEqual({ slot: 0, mode: "minor" });
    expect(parseHomeKey("Am")).toEqual({ slot: 0, mode: "minor" });
    expect(keyTonic("Bb minor")).toEqual({ tonicPc: 10, mode: "minor" });
    expect(parseHomeKey(undefined)).toBeUndefined();
    expect(parseHomeKey("不明")).toBeUndefined();
    const wheel = keyWheel([entry("a", "C major"), entry("b", undefined), entry("c", "?")]);
    expect(wheel.major[0]).toHaveLength(1);
    expect([...wheel.major, ...wheel.minor].flat()).toHaveLength(1);
  });

  it("D6: the wheel names use ♯ and ♭, majors and their relative minors in the same place", () => {
    expect(WHEEL_NAMES.major).toEqual(["C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F"]);
    expect(WHEEL_NAMES.minor[0]).toBe("A");
    expect(WHEEL_NAMES.minor[parseHomeKey("C# minor")!.slot]).toBe("C♯");
  });

  it("D5: opens on the key with the most progressions; a tie goes to the key nearer C", () => {
    expect(initialKey(keyWheel([entry("a", "D major"), entry("b", "D major"), entry("c", "C major")]))).toEqual({ slot: 2, mode: "major" });
    expect(initialKey(keyWheel([entry("a", "F major"), entry("b", "D major"), entry("c", "G major")]))).toEqual({ slot: 1, mode: "major" });
    expect(initialKey(keyWheel([entry("a", "F major"), entry("b", "D major")]))).toEqual({ slot: 11, mode: "major" });
    expect(initialKey(keyWheel([entry("a", "A minor"), entry("b", "A minor"), entry("c", "C major")]))).toEqual({ slot: 0, mode: "minor" });
    expect(initialKey(keyWheel([entry("a", "A minor"), entry("b", "G major")]))).toEqual({ slot: 1, mode: "major" });
    expect(initialKey(keyWheel([]))).toEqual({ slot: 0, mode: "major" });
  });

  it("lists a slot's progressions newest first", () => {
    const wheel = keyWheel([entry("old", "C major", 1), entry("new", "C major", 3), entry("mid", "C", 2)]);
    expect(wheel.major[0]!.map((item) => item.block.id)).toEqual(["new", "mid", "old"]);
  });
});
