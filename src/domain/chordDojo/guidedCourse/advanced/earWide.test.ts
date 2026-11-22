import { describe, expect, it } from "vitest";
import { advancedItemById } from "./bank";
import { judgeAdvancedChord } from "./judge";
import { LV7_OUTSIDE_ITEMS, LV7_REORDERED_ITEMS, practiceMaterials } from "./practice";

/** P23-57: Lv7 ear practice beyond the six families (practice only). */
describe("P23-57 wider ear practice", () => {
  it("reorders diatonic chords in ways the families never use", () => {
    expect(LV7_REORDERED_ITEMS.map((item) => item.chords.map((chord) => chord.label).join(" "))).toEqual([
      "Am F C G",
      "Dm7 G7 Am7",
      "G Bm C D",
      "Fmaj7 Dm7 Am7 C7",
    ]);
  });

  it("puts one chord from outside the key in each question", () => {
    expect(LV7_OUTSIDE_ITEMS.map((item) => item.chords.map((chord) => chord.label).join(" "))).toEqual([
      "C F Fm C",
      "C E7 Am",
      "A♭ B♭ C",
      "Cm7 F7 Gmaj7",
      "F G7 C7 F",
    ]);
  });

  it("asks every one by ear after a major cadence, hides the names, and keeps them out of the official set", () => {
    for (const item of [...LV7_REORDERED_ITEMS, ...LV7_OUTSIDE_ITEMS]) {
      expect(item.prompt).toBe("ear");
      expect(item.revealCards).toBe(false);
      expect(item.setId).toBe("practice");
      expect(item.referenceChords!.map((chord) => chord.quality)).toEqual(["maj", "maj", "maj"]);
      expect(item.label).not.toMatch(/[A-G]/);
      for (const chord of item.chords) expect(judgeAdvancedChord(chord, chord.referenceNotes).ok, chord.label).toBe(true);
      expect(advancedItemById(item.id)).toBe(item);
    }
  });

  it("lists the two runs after the stairs and before the six pairs", () => {
    const ids = practiceMaterials(7).map((material) => material.id);
    expect(ids.slice(4, 6)).toEqual(["lv7-prac-wide-order", "lv7-prac-wide-out"]);
    expect(practiceMaterials(7)[4]!.itemIds).toHaveLength(4);
    expect(practiceMaterials(7)[5]!.itemIds).toHaveLength(5);
  });
});
