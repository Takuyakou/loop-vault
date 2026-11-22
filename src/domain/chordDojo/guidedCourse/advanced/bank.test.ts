import { describe, expect, it } from "vitest";
import { ADVANCED_ITEMS, advancedDemoItems, advancedItemById, advancedSetIds, ADVANCED_LEVEL_ORDER } from "./bank";
import { judgeAdvancedChord, judgeSingleChord } from "./judge";
import { ADVANCED_LEVELS, TWELVE_KEYS } from "./levels";
import { LV4_SLASH_SAME_DAY } from "./lv4";
import { LV5_DELAY_IDS, LV5_SAME_DAY_IDS } from "./lv5";
import { LV6_DELAY_IDS, LV6_SAME_DAY_IDS, LV6_RECHECK } from "./lv6";
import { LV7_DELAY_IDS, LV7_SAME_DAY_IDS } from "./lv7";
import { LV8_GROUPS, LV8_EXAMPLES, lv8GroupDelayIds, lv8GroupSameDayIds } from "./lv8";
import { CAPSTONE_DELAY_IDS, CAPSTONE_DELAY_EAR_IDS, CAPSTONE_NAME, CAPSTONE_PROGRESSION, CAPSTONE_SAME_DAY, CAPSTONE_SIGHT } from "./capstone";

describe("P23-45 advanced bank", () => {
  it("gives every item a unique id and resolves each through the bank", () => {
    expect(new Set(ADVANCED_ITEMS.map((item) => item.id)).size).toBe(ADVANCED_ITEMS.length);
    for (const item of ADVANCED_ITEMS) expect(advancedItemById(item.id)).toBe(item);
  });

  it("accepts every authored reference answer with its own judgement", () => {
    for (const item of ADVANCED_ITEMS) {
      if (item.chords.length === 1) {
        expect(judgeSingleChord(item, item.chords[0]!.referenceNotes).ok, item.id).toBe(true);
      }
      for (const [index, chord] of item.chords.entries()) {
        const judgement = judgeAdvancedChord(chord, chord.referenceNotes);
        expect(judgement.ok, `${item.id}#${index} ${chord.label}: ${judgement.reason}`).toBe(true);
      }
    }
  });

  it("keeps the slash chords playable and still strict about the rest (P23-54: on-chords and an inversion)", () => {
    const cases = [
      { id: "lv4-sd-Fmaj7-a", bass: 7, missing: 9 }, // F/G
      { id: "lv4-dl-Ab-a", bass: 5, missing: 7 }, // E♭/F
      { id: "lv4-sd-Cmaj7-a", bass: 8, missing: 4 }, // E7/G#
    ] as const;
    for (const entry of cases) {
      const item = advancedItemById(entry.id)!;
      const chord = item.chords[0]!;
      expect(chord.bassPitchClass, entry.id).toBe(entry.bass);
      expect(judgeAdvancedChord(chord, chord.referenceNotes).ok, entry.id).toBe(true);
      // The specified bass is the allowed lowest note; another bass fails.
      const wrongBass = [30 + ((entry.bass + 1) % 12), ...chord.referenceNotes.filter((note) => note % 12 !== entry.bass)];
      expect(judgeAdvancedChord(chord, wrongBass).ok, `${entry.id} wrong bass`).toBe(false);
      // Dropping a required upper tone still fails.
      const withoutRequired = chord.referenceNotes.filter((note) => note % 12 !== entry.missing);
      expect(judgeAdvancedChord(chord, withoutRequired).ok, `${entry.id} missing required`).toBe(false);
      // A foreign upper tone is still detected (the bass pitch class is the only exception).
      const foreignPc = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        .find((pitchClass) => !chord.allowedPitchClasses.includes(pitchClass) && pitchClass !== chord.bassPitchClass)!;
      expect(judgeAdvancedChord(chord, [...chord.referenceNotes, 60 + foreignPc]).ok, `${entry.id} foreign`).toBe(false);
    }
  });

  it("matches the P23-45 set sizes for Lv4–7", () => {
    expect(advancedSetIds(4, "sameDay")).toHaveLength(20);
    expect(advancedSetIds(4, "delay")).toHaveLength(10);
    expect(LV4_SLASH_SAME_DAY).toBeGreaterThanOrEqual(6);
    expect(LV5_SAME_DAY_IDS).toHaveLength(14);
    expect(LV5_DELAY_IDS).toHaveLength(5);
    expect(LV6_SAME_DAY_IDS).toHaveLength(12);
    expect(LV6_DELAY_IDS).toHaveLength(6);
    expect(LV7_SAME_DAY_IDS).toHaveLength(10);
    expect(LV7_DELAY_IDS).toHaveLength(5);
  });

  it("covers all six progression families in the Lv5 same-day set", () => {
    const families = new Set(LV5_SAME_DAY_IDS.map((id) => advancedItemById(id)!.family));
    expect(families.size).toBe(6);
  });

  it("covers twelve keys in Lv6 and keeps the recheck set at twelve", () => {
    expect(new Set(LV6_SAME_DAY_IDS.map((id) => advancedItemById(id)!.keyRoot)).size).toBe(12);
    expect(LV6_RECHECK).toHaveLength(12);
    expect(new Set(LV6_RECHECK.map((item) => item.keyRoot)).size).toBe(12);
  });

  it("uses at least four families in the Lv6 same-day set and hides the transposed names", () => {
    const items = LV6_SAME_DAY_IDS.map((id) => advancedItemById(id)!);
    expect(new Set(items.map((item) => item.family)).size).toBeGreaterThanOrEqual(4);
    for (const item of items) {
      expect(item.revealCards).toBe(false);
      expect(item.label).not.toContain("→");
      expect(item.label).toContain("キー ");
    }
  });

  it("keeps the Lv7 ear questions free of names, degrees and keyboard samples", () => {
    for (const id of [...LV7_SAME_DAY_IDS, ...LV7_DELAY_IDS]) {
      const item = advancedItemById(id)!;
      expect(item.prompt).toBe("ear");
      expect(item.revealCards).toBe(false);
      expect(item.allowedPlaybacks).toBe(2);
      expect(item.referenceChords ?? []).not.toHaveLength(0);
      for (const chord of item.chords) expect(item.label).not.toContain(chord.label);
    }
  });

  it("keeps Lv7 practice examples out of the official sets", () => {
    const official = new Set([...LV7_SAME_DAY_IDS, ...LV7_DELAY_IDS]);
    for (const item of advancedDemoItems(7)) expect(official.has(item.id)).toBe(false);
  });

  it("builds three Lv8 groups: 12 names, 4 recolours and 6 ear the same day; 6 names and 3 recolours later (P23-56)", () => {
    for (const group of LV8_GROUPS) {
      expect(lv8GroupSameDayIds(group.id)).toHaveLength(22);
      expect(lv8GroupDelayIds(group.id)).toHaveLength(9);
      const parts = lv8GroupSameDayIds(group.id).map((id) => advancedItemById(id)!.part);
      expect(new Set(parts)).toEqual(new Set([`${group.id}:name`, `${group.id}:context`, `${group.id}:ear`]));
      expect(parts.filter((part) => part === `${group.id}:context`)).toHaveLength(4);
      const later = lv8GroupDelayIds(group.id).map((id) => advancedItemById(id)!.part);
      expect(new Set(later)).toEqual(new Set([`${group.id}:delay`, `${group.id}:delay-context`]));
      // The kept questions are the P23-45 ones under the same ids.
      expect(lv8GroupSameDayIds(group.id)[0]).toBe(`lv8-${group.id}-name-01`);
      expect(lv8GroupDelayIds(group.id)[0]).toBe(`lv8-${group.id}-dl-01`);
    }
  });

  it("asks each recolour as the coloured progression, naming the plain one (P23-56)", () => {
    expect(advancedItemById("lv8-thirteen-ctx-01")!.label).toBe("Dm9 → G13 → Cmaj9");
    expect(advancedItemById("lv8-thirteen-ctx-01")!.detail).toBe("元の進行 Dm7 → G7 → Cmaj7。響きを足して弾く");
    expect(advancedItemById("lv8-thirteen-ctx-01")!.plainChords!.map((chord) => chord.label)).toEqual(["Dm7", "G7", "Cmaj7"]);
    expect(advancedItemById("lv8-six-ctx-01")!.label).toBe("Cadd9 → F6 → Gsus4 → C");
    for (const group of LV8_GROUPS) {
      for (const id of [...lv8GroupSameDayIds(group.id), ...lv8GroupDelayIds(group.id)]) {
        const item = advancedItemById(id)!;
        if (!item.part!.endsWith("context")) continue;
        expect(item.kind).toBe("progression");
        expect(item.chords.length).toBeGreaterThanOrEqual(3);
        expect(item.detail!.startsWith("元の進行 ")).toBe(true);
        // 「元の進行を聴く」 plays exactly the progression named in the detail.
        expect(item.detail).toContain(item.plainChords!.map((chord) => chord.label).join(" → "));
        expect(item.plainChords).toHaveLength(item.chords.length);
      }
    }
  });

  it("includes every target vocabulary of each Lv8 group", () => {
    const vocabularyOf = (groupId: string) => new Set(lv8GroupSameDayIds(groupId)
      .map((id) => advancedItemById(id)!)
      .filter((item) => item.part === `${groupId}:name`)
      .map((item) => `${item.chords[0]!.quality}${item.chords[0]!.label.includes("ルートレス") ? ":rootless" : ""}`));
    const six = vocabularyOf("six");
    for (const quality of ["six", "add9", "sus2", "sus4"]) expect(six.has(quality)).toBe(true);
    const nine = vocabularyOf("nine");
    for (const quality of ["min9", "maj9", "dom9"]) expect(nine.has(quality)).toBe(true);
    const thirteen = vocabularyOf("thirteen");
    expect(thirteen.has("dom13")).toBe(true);
    expect([...thirteen].filter((value) => value.endsWith(":rootless")).length).toBeGreaterThanOrEqual(3);
  });

  it("shows the borrowed, secondary-dominant and backdoor examples as practice only", () => {
    expect(LV8_EXAMPLES).toHaveLength(3);
    const official = new Set(LV8_GROUPS.flatMap((group) => [...lv8GroupSameDayIds(group.id), ...lv8GroupDelayIds(group.id)]));
    for (const item of LV8_EXAMPLES) expect(official.has(item.id)).toBe(false);
    expect(LV8_EXAMPLES.map((item) => item.label).join(" ")).toContain("借用");
    expect(LV8_EXAMPLES.map((item) => item.label).join(" ")).toContain("セカンダリー");
    expect(LV8_EXAMPLES.map((item) => item.label).join(" ")).toContain("バックドア");
  });

  it("builds the capstone ①②③ sets and the delayed day as P23-45 asks", () => {
    expect(CAPSTONE_NAME).toHaveLength(24);
    expect(new Set(CAPSTONE_NAME.map((item) => item.chords[0]!.root)).size).toBe(12);
    expect(CAPSTONE_PROGRESSION).toHaveLength(5);
    for (const item of CAPSTONE_PROGRESSION) expect(item.chords).toHaveLength(4);
    expect(CAPSTONE_SIGHT).toHaveLength(3);
    for (const item of CAPSTONE_SIGHT) {
      expect(item.chords).toHaveLength(8);
      expect(item.tempoBpm).toBeGreaterThanOrEqual(70);
    }
    expect(CAPSTONE_SAME_DAY).toHaveLength(32);
    expect(CAPSTONE_DELAY_IDS).toHaveLength(12);
    expect(CAPSTONE_DELAY_EAR_IDS).toHaveLength(3);
  });

  it("lists every advanced level in the selector order", () => {
    expect(ADVANCED_LEVEL_ORDER).toEqual([4, 5, 6, 7, 8, "capstone"]);
    expect(ADVANCED_LEVELS.map((spec) => spec.level)).toEqual([...ADVANCED_LEVEL_ORDER]);
    expect(TWELVE_KEYS).toHaveLength(12);
  });
});
