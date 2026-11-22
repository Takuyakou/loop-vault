import { CAPSTONE_ITEMS, CAPSTONE_DEMO } from "./capstone";
import { PRACTICE_ITEMS } from "./practice";
import { LV4_DEMO, LV4_ITEMS } from "./lv4";
import { LV5_ITEMS, LV5_DEMO } from "./lv5";
import { LV6_ITEMS, LV6_DEMO, recheckIdsFor } from "./lv6";
import { LV7_ITEMS, LV7_DEMO } from "./lv7";
import { LV8_ITEMS, LV8_EXAMPLES, lv8GroupDelayIds, lv8GroupSameDayIds, LV8_GROUPS } from "./lv8";
import type { AdvancedBlock, AdvancedCourseLevel, AdvancedItem } from "./types";

/**
 * The read-only advanced bank. Product code looks items up here; nothing generates an answer at
 * runtime. Every item id appears exactly once, so a saved trial always resolves to the authored
 * answer rule it was judged with.
 */
export const ADVANCED_ITEMS: readonly AdvancedItem[] = [
  ...LV4_ITEMS,
  ...LV4_DEMO,
  ...LV5_ITEMS,
  ...LV5_DEMO,
  ...LV6_ITEMS,
  ...LV6_DEMO,
  ...LV7_ITEMS,
  ...LV7_DEMO,
  ...LV8_ITEMS,
  ...LV8_EXAMPLES,
  ...CAPSTONE_ITEMS,
  ...CAPSTONE_DEMO,
  ...PRACTICE_ITEMS,
];

const BY_ID = new Map(ADVANCED_ITEMS.map((item) => [item.id, item]));

export function advancedItemById(id: string): AdvancedItem | undefined {
  return BY_ID.get(id);
}

const DEMO_BY_LEVEL: Readonly<Record<string, readonly AdvancedItem[]>> = {
  "4": LV4_DEMO,
  "5": LV5_DEMO,
  "6": LV6_DEMO,
  "7": LV7_DEMO,
  "8": LV8_EXAMPLES,
  capstone: CAPSTONE_DEMO,
};

/** Example cards shown before the first official attempt of a level (never recorded as trials). */
export function advancedDemoItems(level: AdvancedCourseLevel): readonly AdvancedItem[] {
  return DEMO_BY_LEVEL[String(level)] ?? [];
}

export function advancedDemoIds(level: AdvancedCourseLevel): readonly string[] {
  return advancedDemoItems(level).map((item) => item.id);
}

export const ADVANCED_LEVEL_ORDER: readonly AdvancedCourseLevel[] = [4, 5, 6, 7, 8, "capstone"];

/** The ordered item ids of one official set. Lv8 is per group; every other level has one set. */
export function advancedSetIds(level: AdvancedCourseLevel, block: AdvancedBlock, group?: string): readonly string[] {
  const official = (item: AdvancedItem) => item.setId !== "demo" && item.setId !== "practice";
  switch (level) {
    case 4:
      return LV4_ITEMS.filter((item) => official(item) && item.block === block).map((item) => item.id);
    case 5:
      return LV5_ITEMS.filter((item) => official(item) && item.block === block).map((item) => item.id);
    case 6:
      return LV6_ITEMS.filter((item) => official(item) && item.block === block && item.setId !== "recheck").map((item) => item.id);
    case 7:
      return LV7_ITEMS.filter((item) => official(item) && item.block === block).map((item) => item.id);
    case 8:
      return group === undefined ? [] : block === "sameDay" ? lv8GroupSameDayIds(group) : lv8GroupDelayIds(group);
    case "capstone":
      return CAPSTONE_ITEMS.filter((item) => official(item) && item.block === block).map((item) => item.id);
  }
}

/** The setId an attempt of `level`/`block` starts with. */
export function advancedSetId(level: AdvancedCourseLevel, block: AdvancedBlock, group?: string): string {
  return level === 8 ? (group ?? LV8_GROUPS[0]!.id) : block;
}

export { LV8_GROUPS, recheckIdsFor };
