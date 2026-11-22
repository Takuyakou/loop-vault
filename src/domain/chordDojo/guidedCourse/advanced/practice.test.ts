import { describe, expect, it } from "vitest";
import { advancedItemById, advancedSetIds } from "./bank";
import { CAPSTONE_PRACTICE_ITEMS, LV6_PRACTICE_ITEMS, LV6_PRACTICE_FAMILIES, PRACTICE_ITEMS, practiceMaterials } from "./practice";
import { judgeAdvancedChord } from "./judge";
import { CAPSTONE_SIGHT } from "./capstone";
import { LV8_GROUPS, lv8NameCombos } from "./lv8";
import { LV6_RECHECK, LV6_SAME_DAY } from "./lv6";

describe("P23-46 practice material", () => {
  it("keeps every practice item out of the official sets and resolvable in the bank", () => {
    const official = new Set<string>([
      ...advancedSetIds(4, "sameDay"), ...advancedSetIds(4, "delay"),
      ...advancedSetIds(5, "sameDay"), ...advancedSetIds(5, "delay"),
      ...advancedSetIds(6, "sameDay"), ...advancedSetIds(6, "delay"),
      ...advancedSetIds(7, "sameDay"), ...advancedSetIds(7, "delay"),
      ...LV8_GROUPS.flatMap((group) => [...advancedSetIds(8, "sameDay", group.id), ...advancedSetIds(8, "delay", group.id)]),
      ...advancedSetIds("capstone", "sameDay"), ...advancedSetIds("capstone", "delay"),
    ]);
    expect(PRACTICE_ITEMS.length).toBeGreaterThan(60);
    for (const item of PRACTICE_ITEMS) {
      expect(advancedItemById(item.id), item.id).toBe(item);
      expect(official.has(item.id), item.id).toBe(false);
    }
  });

  it("judges every practice reference answer as correct", () => {
    for (const item of PRACTICE_ITEMS) {
      for (const [index, chord] of item.chords.entries()) {
        expect(judgeAdvancedChord(chord, chord.referenceNotes).ok, `${item.id}#${index}`).toBe(true);
      }
    }
  });

  it("shows the Lv4 common-tone and bass-motion examples", () => {
    const materials = practiceMaterials(4);
    expect(materials).toHaveLength(2);
    expect(materials[0]!.label).toBe("Cmaj7 → Am7");
    expect(materials[0]!.commonPitchClasses).toEqual(expect.arrayContaining([0, 4, 7]));
    expect(materials[1]!.label).toBe("C/E → F");
    expect(materials[1]!.bassMotion).toEqual([4, 5]);
    for (const material of materials) {
      for (const id of material.itemIds) expect(advancedItemById(id), id).toBeDefined();
      expect(advancedItemById(material.itemIds[0]!)!.chords.map((chord) => chord.label)).toEqual(material.chords.map((chord) => chord.label));
    }
  });

  it("offers all six Lv5 families with resolvable official items", () => {
    const materials = practiceMaterials(5);
    expect(materials).toHaveLength(6);
    expect(new Set(materials.map((material) => material.family)).size).toBe(6);
    for (const material of materials) {
      const item = advancedItemById(material.itemIds[0]!)!;
      expect(item.chords.map((chord) => chord.label)).toEqual(material.chords.map((chord) => chord.label));
    }
  });

  it("builds every Lv6 family in every key and keeps the E/B♭ recheck on another family", () => {
    expect(LV6_PRACTICE_ITEMS).toHaveLength(LV6_PRACTICE_FAMILIES.length * 12);
    for (const item of LV6_PRACTICE_ITEMS) expect(advancedItemById(item.id)).toBe(item);
    for (const key of [4, 10]) {
      const sameDay = LV6_SAME_DAY.find((item) => item.keyRoot === key)!;
      const recheck = LV6_RECHECK.find((item) => item.keyRoot === key)!;
      expect(recheck.family, `key ${key}`).not.toBe(sameDay.family);
    }
  });

  it("pairs Lv7 ear practice from two to four chords in major and minor", () => {
    // P23-55: the two-chord functions and the three bass-line materials come first; P23-57 adds the two
    // wider ear runs after them; the six pairs follow.
    const materials = practiceMaterials(7).slice(6);
    expect(materials).toHaveLength(6);
    expect(materials.map((material) => material.chords.length)).toEqual([2, 3, 4, 2, 3, 4]);
    for (const material of materials) {
      expect(material.cadence?.length).toBe(3);
      expect(advancedItemById(material.itemIds[0]!)).toBeDefined();
    }
  });

  it("gives every Lv8 group comparisons and at least two in-vocabulary progressions", () => {
    for (const group of LV8_GROUPS) {
      const materials = practiceMaterials(8, group.id);
      expect(materials.length, group.id).toBeGreaterThanOrEqual(2);
      expect(materials.some((material) => material.kind === "comparison" || material.kind === "progression"), group.id).toBe(true);
      // P23-56: the recolour entry is a set of the group's official questions, so its own id is not an item; every id it runs is.
      for (const material of materials) {
        if (material.id.startsWith("lv8-prac-recolour-")) for (const id of material.itemIds) expect(advancedItemById(id), id).toBeDefined();
        else expect(advancedItemById(material.id), material.id).toBeDefined();
      }
      expect(materials[materials.length - 1]!.itemIds).toHaveLength(7);
    }
    const allLabels = LV8_GROUPS.flatMap((group) => practiceMaterials(8, group.id).map((material) => material.label)).join(" ");
    expect(allLabels).toContain("sus4");
    expect(allLabels).toContain("add9");
    expect(allLabels).toContain("m9");
    expect(allLabels).toContain("13");
    expect(allLabels).toContain("ルートレス");
    expect(practiceMaterials(8, "six").some((material) => material.id === "lv8-example-borrowed")).toBe(true);
    expect(practiceMaterials(8, "nine").some((material) => material.id === "lv8-example-secondary")).toBe(true);
    expect(practiceMaterials(8, "thirteen").some((material) => material.id === "lv8-example-backdoor")).toBe(true);
  });

  it("keeps the capstone practice charts distinct from the official sight charts", () => {
    const official = CAPSTONE_SIGHT.map((item) => item.chords.map((chord) => chord.referenceNotes.join(",")).join("|"));
    const practice = CAPSTONE_PRACTICE_ITEMS.map((item) => item.chords.map((chord) => chord.referenceNotes.join(",")).join("|"));
    expect(new Set([...official, ...practice]).size).toBe(official.length + practice.length);
    const materials = practiceMaterials("capstone");
    expect(materials.map((material) => material.itemIds[0])).toEqual(expect.arrayContaining([...CAPSTONE_PRACTICE_ITEMS.map((item) => item.id)]));
  });

  it("uses 12 distinct Lv8 name combinations and 6 delayed ones that never repeat them", () => {
    for (const group of LV8_GROUPS) {
      const sameDay = lv8NameCombos(group.id, "sameDay");
      const delay = lv8NameCombos(group.id, "delay");
      expect(sameDay).toHaveLength(12);
      expect(delay).toHaveLength(6);
      const key = (combo: { root: number; vocabulary: number }) => `${combo.root}:${combo.vocabulary}`;
      expect(new Set(sameDay.map(key)).size).toBe(12);
      expect(new Set(delay.map(key)).size).toBe(6);
      expect(delay.some((combo) => sameDay.some((entry) => key(entry) === key(combo))), group.id).toBe(false);
      expect(new Set(sameDay.map((combo) => combo.vocabulary)).size, group.id).toBe(group.vocabulary.length);
      expect(new Set(delay.map((combo) => combo.vocabulary)).size, group.id).toBe(group.vocabulary.length);
    }
  });

  it("shows the borrowed, secondary and backdoor examples landing on Cmaj7", () => {
    const materials = practiceMaterials(8, "six");
    expect(materials.length).toBeGreaterThan(0);
    const examples = ["lv8-example-borrowed", "lv8-example-secondary", "lv8-example-backdoor"].map((id) => advancedItemById(id)!);
    for (const item of examples) {
      expect(item.label).toContain("Cmaj7");
      expect(item.chords[item.chords.length - 1]!.label).toBe("Cmaj7");
    }
  });
});
