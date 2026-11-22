import { describe, expect, it } from "vitest";
import { advancedItemById } from "./bank";
import { familyChords, keyCadence, makeChord, voiceLed } from "./build";
import { CAPSTONE_SIGHT } from "./capstone";
import { judgeAdvancedChord } from "./judge";
import { LV7_ITEMS } from "./lv7";
import { CAPSTONE_PRACTICE_ITEMS, practiceMaterials } from "./practice";

/** P23-54: the musical corrections — minor cadences, hand-written charts and voice-led examples. */
describe("P23-54 musical material", () => {
  it("plays a minor cadence before a minor ear question and a major one before the rest", () => {
    const labels = (id: string) => advancedItemById(id)!.referenceChords!.map((chord) => chord.label);
    expect(labels("lv7-sd-05")).toEqual(["Am", "E7", "Am"]); // Bm7♭5 → E7 → Am7
    expect(labels("lv7-dl-05")).toEqual(["Fm", "C7", "Fm"]);
    expect(labels("lv7-sd-01")).toEqual(["C", "G", "C"]);
    for (const item of LV7_ITEMS) {
      const minor = item.family === "minor-ii-v-i";
      expect(item.referenceChords![0]!.quality, item.id).toBe(minor ? "min" : "maj");
      expect(item.detail, item.id).toContain(minor ? "m のカデンツ" : " のカデンツ");
    }
    expect(practiceMaterials(7).filter((material) => material.id.includes("minor")).every((material) => material.cadence![0]!.label === "Am")).toBe(true);
    expect(keyCadence(9, "minor").map((chord) => chord.label)).toEqual(["Am", "E7", "Am"]);
  });

  it("uses three hand-written eight-bar charts", () => {
    expect(CAPSTONE_SIGHT.map((item) => item.chords.map((chord) => chord.label).join(" "))).toEqual([
      "Cmaj7 Am7 Dm7 G7 Em7 A7 Dm7 G7",
      "Gmaj7 B7 Em7 G7 Cmaj7 Cm D7 Gmaj7",
      "Fmaj7 Am7 B♭maj7 C7 Dm7 Gm7 E♭7 Fmaj7",
    ]);
    expect(CAPSTONE_SIGHT.map((item) => item.id)).toEqual(["cap-sight-01", "cap-sight-02", "cap-sight-03"]);
    expect(CAPSTONE_PRACTICE_ITEMS.map((item) => item.chords.map((chord) => chord.label).join(" "))).toEqual([
      "Dmaj7 F#m7 Gmaj7 A7 Bm7 E7 Em7 A7",
      "B♭maj7 Gm7 E♭maj7 F7 Dm7 G7 Cm7 F7",
    ]);
  });

  it("moves each example chord to the nearest placement and keeps the answer rule", () => {
    // Dm7 → G7 → Cmaj7: C and D stay, F stays, A moves to G, then B to C.
    expect(familyChords("major-ii-v-i", 0).map((chord) => chord.referenceNotes)).toEqual([
      [50, 60, 62, 65, 69],
      [55, 59, 62, 65, 67],
      [48, 59, 60, 64, 67],
    ]);
    const plain = [makeChord({ root: 2, quality: "min7" }), makeChord({ root: 7, quality: "dom7" }), makeChord({ root: 0, quality: "maj7" })];
    const led = voiceLed(plain);
    for (const [index, chord] of led.entries()) {
      expect(chord.requiredPitchClasses).toEqual(plain[index]!.requiredPitchClasses);
      expect(chord.allowedPitchClasses).toEqual(plain[index]!.allowedPitchClasses);
      expect(new Set(chord.referenceNotes.map((note) => note % 12))).toEqual(new Set(plain[index]!.referenceNotes.map((note) => note % 12)));
      expect(judgeAdvancedChord(chord, chord.referenceNotes).ok).toBe(true);
    }
    expect(led[0]).toEqual(plain[0]);
  });

  it("keeps a slash bass lowest and moves it to the nearer octave", () => {
    const [, slash, next] = voiceLed([makeChord({ root: 0, quality: "maj" }), makeChord({ root: 0, quality: "maj", bass: 4 }), makeChord({ root: 5, quality: "maj" })]);
    expect(slash!.referenceNotes).toEqual([52, 60, 67]);
    expect(next!.referenceNotes).toEqual([53, 60, 65, 69]);
  });

  it("keeps every example inside the keyboard (C2–C6)", () => {
    const all = [...LV7_ITEMS, ...CAPSTONE_SIGHT, ...CAPSTONE_PRACTICE_ITEMS].flatMap((item) => [...(item.referenceChords ?? []), ...item.chords]);
    for (const chord of all) {
      expect(Math.min(...chord.referenceNotes), chord.label).toBeGreaterThanOrEqual(36);
      expect(Math.max(...chord.referenceNotes), chord.label).toBeLessThanOrEqual(84);
    }
  });
});
