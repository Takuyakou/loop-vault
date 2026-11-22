import { describe, expect, it } from "vitest";
import { judgeAdvancedChord, judgeProgression, judgeSight, judgeSingleChord } from "./judge";
import { makeChord, makeItem, type ChordSpec } from "./build";
import type { AdvancedItem } from "./types";

function single(quality: ChordSpec["quality"], extra: Partial<Omit<ChordSpec, "quality">> = {}): AdvancedItem {
  return makeItem({
    id: `item-${quality}`,
    level: 8,
    block: "sameDay",
    setId: "six",
    kind: "vocab",
    part: "six:name",
    label: "x",
    chords: [makeChord({ ...extra, root: extra.root ?? 0, quality })],
    revealCards: true,
    allowedPlaybacks: 0,
  });
}

describe("P23-45 advanced judgement", () => {
  it("accepts any inversion or doubling of a chord name answer", () => {
    const item = single("maj");
    expect(judgeSingleChord(item, [60, 64, 67]).ok).toBe(true);
    expect(judgeSingleChord(item, [64, 67, 72]).ok).toBe(true); // first inversion
    expect(judgeSingleChord(item, [48, 60, 64, 67, 72]).ok).toBe(true); // doubled root
  });

  it("rejects a missing tone and a foreign tone", () => {
    const item = single("maj");
    // The fifth is optional under the normal leniency; the third is not.
    const missing = judgeSingleChord(item, [60, 67]);
    expect(missing.ok).toBe(false);
    expect(missing.reason).toContain("構成音が足りません");
    expect(judgeSingleChord(item, [60, 64])).toMatchObject({ ok: true });
    const foreign = judgeSingleChord(item, [60, 64, 67, 73]);
    expect(foreign.ok).toBe(false);
    expect(foreign.reason).toContain("和音外の音");
  });

  it("checks the lowest note only when the question names one", () => {
    const slash = single("maj", { bass: 4 });
    expect(judgeAdvancedChord(slash.chords[0]!, [40, 52, 55, 60]).ok).toBe(true);
    expect(judgeAdvancedChord(slash.chords[0]!, [36, 52, 55, 60]).ok).toBe(false);
    expect(slash.chords[0]!.bassPitchClass).toBe(4);
  });

  it("requires a 13th but not the fifth or eleventh of a 13 chord", () => {
    const chord = makeChord({ root: 0, quality: "dom13" });
    expect(chord.requiredPitchClasses).toContain(9);
    expect(chord.requiredPitchClasses).not.toContain(7);
    expect(judgeAdvancedChord(chord, [60, 64, 70, 81]).ok).toBe(true);
    expect(judgeAdvancedChord(chord, [60, 64, 70]).ok).toBe(false);
    expect(judgeAdvancedChord(chord, [60, 64, 67, 70, 81]).ok).toBe(true);
  });

  it("lets a rootless voicing omit the root but keeps the root allowed", () => {
    const chord = makeChord({ root: 0, quality: "dom13", rootless: true });
    expect(chord.requiredPitchClasses).not.toContain(0);
    expect(chord.requiredPitchClasses).toEqual(expect.arrayContaining([4, 10, 9]));
    expect(judgeAdvancedChord(chord, [64, 70, 81]).ok).toBe(true);
    expect(judgeAdvancedChord(chord, [60, 64, 70, 81]).ok).toBe(true);
    expect(judgeAdvancedChord(chord, [60, 64, 70]).ok).toBe(false);
  });

  it("requires the sus interval for sus2 and sus4", () => {
    expect(judgeAdvancedChord(makeChord({ root: 0, quality: "sus2" }), [60, 62])).toMatchObject({ ok: true });
    expect(judgeAdvancedChord(makeChord({ root: 0, quality: "sus2" }), [60, 64])).toMatchObject({ ok: false });
    expect(judgeAdvancedChord(makeChord({ root: 0, quality: "sus4" }), [60, 65])).toMatchObject({ ok: true });
  });

  it("passes a progression only when every card is played in order", () => {
    const item = makeItem({
      id: "prog",
      level: 5,
      block: "sameDay",
      setId: "sameDay",
      kind: "progression",
      part: "progressions",
      label: "C → G → Am",
      chords: [makeChord({ root: 0, quality: "maj" }), makeChord({ root: 7, quality: "maj" }), makeChord({ root: 9, quality: "min" })],
      revealCards: true,
      allowedPlaybacks: 0,
    });
    expect(judgeProgression(item, [[60, 64, 67], [67, 71, 74], [69, 72, 76]]).ok).toBe(true);
    expect(judgeProgression(item, [[67, 71, 74], [60, 64, 67], [69, 72, 76]]).ok).toBe(false);
    const short = judgeProgression(item, [[60, 64, 67], [67, 71, 74]]);
    expect(short.ok).toBe(false);
    expect(short.steps).toHaveLength(3);
    expect(short.steps[2]!.ok).toBe(false);
  });

  it("starts a mid-card question from its start index", () => {
    const item = makeItem({
      id: "mid",
      level: 5,
      block: "sameDay",
      setId: "sameDay",
      kind: "progression",
      part: "mid",
      label: "G → Am",
      chords: [makeChord({ root: 0, quality: "maj" }), makeChord({ root: 7, quality: "maj" }), makeChord({ root: 9, quality: "min" })],
      startIndex: 1,
      revealCards: true,
      allowedPlaybacks: 0,
    });
    const judgement = judgeProgression(item, [[67, 71, 74], [69, 72, 76]]);
    expect(judgement.ok).toBe(true);
    expect(judgement.steps).toHaveLength(2);
  });

  it("scores sight reading per beat with the 90% and no-stop rule", () => {
    const chords = [
      makeChord({ root: 0, quality: "maj7" }),
      makeChord({ root: 9, quality: "min7" }),
      makeChord({ root: 5, quality: "maj7" }),
      makeChord({ root: 7, quality: "dom7" }),
      makeChord({ root: 0, quality: "maj7" }),
      makeChord({ root: 4, quality: "min7" }),
      makeChord({ root: 5, quality: "maj7" }),
      makeChord({ root: 7, quality: "dom7" }),
    ];
    const item = makeItem({
      id: "sight",
      level: "capstone",
      block: "sameDay",
      setId: "sameDay",
      kind: "capstone-sight",
      part: "sight",
      label: "初見",
      chords,
      revealCards: true,
      tempoBpm: 80,
      allowedPlaybacks: 0,
    });
    const perfect = chords.flatMap((chord) => Array.from({ length: 4 }, () => chord.referenceNotes));
    expect(judgeSight(item, perfect)).toMatchObject({ ok: true, matched: 32, total: 32, longestStop: 0 });

    // 28/32 = 87.5% is below 90% even though the missed beats are spread out.
    const spread = perfect.map((notes, index) => (index === 1 || index === 5 || index === 9 || index === 13 ? [] : notes));
    const belowRatio = judgeSight(item, spread);
    expect(belowRatio.matched).toBe(28);
    expect(belowRatio.longestStop).toBe(1);
    expect(belowRatio.ok).toBe(false);

    // 30/32 = 93.75% with only single missed beats passes.
    const enough = perfect.map((notes, index) => (index === 1 || index === 5 ? [] : notes));
    expect(judgeSight(item, enough)).toMatchObject({ ok: true, matched: 30, longestStop: 1 });

    // 29/32 = 90.6% but a hole of three beats is a stop, so the chart fails.
    const stopped = perfect.map((notes, index) => (index >= 10 && index <= 12 ? [] : notes));
    const stopping = judgeSight(item, stopped);
    expect(stopping.matched).toBe(29);
    expect(stopping.longestStop).toBe(3);
    expect(stopping.ok).toBe(false);
  });
});
