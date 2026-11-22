import { FAMILY_LABEL, TWELVE_KEYS, type ProgressionFamily } from "./levels";
import { familyChords, makeItem, NOTE_NAMES } from "./build";
import type { AdvancedBlock, AdvancedItem } from "./types";

/**
 * P23-45 Lv6: use the Lv5 progressions in another key. The question shows the family and the key it
 * must be played in; the transposed chord names appear only after the answer. Twelve keys are covered
 * on the same day and six on the delayed day; every key needs correct evidence before the formal pass,
 * and the recheck set contains only the keys that have none.
 */
const SAME_DAY_FAMILIES: readonly ProgressionFamily[] = [
  "major-ii-v-i",
  "i-v-vi-iv",
  "i-vi7-ii-v",
  "iv-iii7-vi",
  "iv-iii-ii-i",
  "i-v-vi-iv",
  "major-ii-v-i",
  "iv-iii-ii-i",
  "i-vi7-ii-v",
  "iv-iii7-vi",
  "i-v-vi-iv",
  "major-ii-v-i",
];

const DELAY_KEYS: readonly number[] = [1, 3, 5, 7, 9, 11];
const DELAY_FAMILIES: readonly ProgressionFamily[] = ["i-v-vi-iv", "major-ii-v-i", "iv-iii7-vi", "i-vi7-ii-v", "iv-iii-ii-i", "i-v-vi-iv"];

function item(id: string, family: ProgressionFamily, key: number, block: AdvancedBlock, setId: string): AdvancedItem {
  const chords = familyChords(family, key);
  return makeItem({
    id,
    level: 6,
    block,
    setId,
    kind: "transpose",
    part: "keys",
    family,
    keyRoot: key,
    label: `キー ${NOTE_NAMES[key]} · ${FAMILY_LABEL[family]}`,
    detail: `${chords.length}コード・移調先のコード名は回答後に表示`,
    chords,
    revealCards: false,
    allowedPlaybacks: 0,
  });
}

export const LV6_SAME_DAY: readonly AdvancedItem[] = TWELVE_KEYS.map((key, index) =>
  item(`lv6-sd-${String(key).padStart(2, "0")}`, SAME_DAY_FAMILIES[index]!, key, "sameDay", "sameDay"));

export const LV6_DELAY: readonly AdvancedItem[] = DELAY_KEYS.map((key, index) =>
  item(`lv6-dl-${String(key).padStart(2, "0")}`, DELAY_FAMILIES[index]!, key, "delay", "delay"));

/** All twelve recheck questions; the plan presents only the keys that still have no correct evidence. */
const RECHECK_CYCLE: readonly ProgressionFamily[] = ["major-ii-v-i", "i-v-vi-iv", "i-vi7-ii-v", "iv-iii7-vi", "iv-iii-ii-i"];

/** P23-46: a recheck uses a different progression than the same-day question for the same key. */
function recheckFamily(family: ProgressionFamily): ProgressionFamily {
  const index = RECHECK_CYCLE.indexOf(family);
  return RECHECK_CYCLE[(index + 1) % RECHECK_CYCLE.length]!;
}

export const LV6_RECHECK: readonly AdvancedItem[] = TWELVE_KEYS.map((key, index) =>
  item(`lv6-rc-${String(key).padStart(2, "0")}`, recheckFamily(SAME_DAY_FAMILIES[index]!), key, "sameDay", "recheck"));

export const LV6_ITEMS: readonly AdvancedItem[] = [...LV6_SAME_DAY, ...LV6_DELAY, ...LV6_RECHECK];
export const LV6_SAME_DAY_IDS: readonly string[] = LV6_SAME_DAY.map((entry) => entry.id);
export const LV6_DELAY_IDS: readonly string[] = LV6_DELAY.map((entry) => entry.id);

export const LV6_DEMO_IDS: readonly string[] = ["lv6-demo-1", "lv6-demo-2"];

export const LV6_DEMO: readonly AdvancedItem[] = [
  item("lv6-demo-1", "iv-iii-ii-i", 8, "sameDay", "demo"),
  item("lv6-demo-2", "i-v-vi-iv", 5, "sameDay", "demo"),
];

export function recheckIdsFor(keys: readonly number[]): readonly string[] {
  return keys.map((key) => `lv6-rc-${String(key).padStart(2, "0")}`);
}
