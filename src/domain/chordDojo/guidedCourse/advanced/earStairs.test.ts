import { describe, expect, it } from "vitest";
import { advancedItemById } from "./bank";
import { judgeAdvancedChord, judgeProgression } from "./judge";
import { LV7_BASS_ITEMS, LV7_FUNCTION_ITEMS, practiceMaterials } from "./practice";

/** P23-55: the ear stairs before Lv7 (practice only). */
describe("P23-55 ear stairs", () => {
  it("offers seven two-chord functions after the C cadence, with the names hidden", () => {
    expect(LV7_FUNCTION_ITEMS.map((item) => item.chords.map((chord) => chord.label).join(" → "))).toEqual([
      "C → F", "C → G", "C → Am", "C → Dm", "C → Em", "C → B♭", "F → Fm",
    ]);
    for (const item of LV7_FUNCTION_ITEMS) {
      expect(item.prompt).toBe("ear");
      expect(item.revealCards).toBe(false);
      expect(item.setId).toBe("practice");
      expect(item.referenceChords!.map((chord) => chord.label)).toEqual(["C", "G", "C"]);
      expect(item.label).not.toContain("→");
    }
    const [func] = practiceMaterials(7);
    expect(func!.id).toBe("lv7-prac-func");
    expect(func!.itemIds).toEqual(LV7_FUNCTION_ITEMS.map((item) => item.id));
  });

  it("asks only the bass line first: the root at the bottom passes alone or under any notes", () => {
    const item = advancedItemById("lv7-prac-bass-251")!;
    expect(item.chords.map((chord) => chord.label)).toEqual(["Dm7 の根音", "G7 の根音", "Cmaj7 の根音"]);
    expect(judgeProgression(item, [[38], [43], [36]]).ok).toBe(true);
    expect(judgeProgression(item, [[38, 61, 66], [43, 70], [36, 49]]).ok).toBe(true);
    expect(judgeAdvancedChord(item.chords[0]!, [41, 50]).ok).toBe(false); // F at the bottom, not D
    // The example still sounds the full chords.
    expect(item.chords[0]!.referenceNotes.length).toBeGreaterThan(1);
  });

  it("follows each bass line with the same progression in full chords, and keeps minor in minor", () => {
    for (const material of practiceMaterials(7).slice(1, 4)) {
      expect(material.itemIds).toHaveLength(2);
      const [bass, full] = material.itemIds.map((id) => advancedItemById(id)!);
      expect(full!.chords.map((chord) => chord.label)).toEqual(bass!.chords.map((chord) => chord.label.replace(" の根音", "")));
    }
    expect(LV7_BASS_ITEMS[1]!.referenceChords!.map((chord) => chord.label)).toEqual(["Am", "E7", "Am"]);
  });
});
