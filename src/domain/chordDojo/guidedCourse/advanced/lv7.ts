import { type ProgressionFamily } from "./levels";
import { FAMILY_MODE, familyChords, keyCadence, makeItem, NOTE_NAMES } from "./build";
import type { AdvancedBlock, AdvancedItem } from "./types";

/**
 * P23-45 Lv7: play a progression by ear. Each question plays a short cadence in the key, then the
 * progression. Names, degrees and the sample keyboard stay hidden; the example may be heard twice as
 * standard presentation, and anything beyond that is a hint. The official set is one question per
 * sequence: every card must be played in order. Voicing, octave and inversion are free (the pitch
 * classes decide the chord), so no bass condition is imposed unless a question states one.
 */
interface EarSpec {
  readonly family: ProgressionFamily;
  readonly key: number;
}

function item(id: string, spec: EarSpec, block: AdvancedBlock, setId: string, index: number): AdvancedItem {
  const chords = familyChords(spec.family, spec.key);
  return makeItem({
    id,
    level: 7,
    block,
    setId,
    kind: "progression",
    part: "ear",
    family: spec.family,
    keyRoot: spec.key,
    prompt: "ear",
    label: `耳の進行 ${index + 1}`,
    detail: `${chords.length}コード・キー ${NOTE_NAMES[spec.key]}${FAMILY_MODE[spec.family] === "minor" ? "m" : ""} のカデンツを聴いてから`,
    chords,
    referenceChords: keyCadence(spec.key, FAMILY_MODE[spec.family]),
    revealCards: false,
    allowedPlaybacks: 2,
  });
}

const SAME_DAY: readonly EarSpec[] = [
  { family: "i-v-vi-iv", key: 0 },
  { family: "major-ii-v-i", key: 7 },
  { family: "iv-iii7-vi", key: 5 },
  { family: "i-vi7-ii-v", key: 2 },
  { family: "minor-ii-v-i", key: 9 },
  { family: "iv-iii-ii-i", key: 10 },
  { family: "i-v-vi-iv", key: 4 },
  { family: "major-ii-v-i", key: 3 },
  { family: "iv-iii-ii-i", key: 9 },
  { family: "i-vi7-ii-v", key: 10 },
];

const DELAY: readonly EarSpec[] = [
  { family: "i-v-vi-iv", key: 1 },
  { family: "major-ii-v-i", key: 6 },
  { family: "iv-iii7-vi", key: 8 },
  { family: "i-vi7-ii-v", key: 11 },
  { family: "minor-ii-v-i", key: 5 },
];

export const LV7_SAME_DAY: readonly AdvancedItem[] = SAME_DAY.map((spec, index) =>
  item(`lv7-sd-${String(index + 1).padStart(2, "0")}`, spec, "sameDay", "sameDay", index));
export const LV7_DELAY: readonly AdvancedItem[] = DELAY.map((spec, index) =>
  item(`lv7-dl-${String(index + 1).padStart(2, "0")}`, spec, "delay", "delay", index));
export const LV7_ITEMS: readonly AdvancedItem[] = [...LV7_SAME_DAY, ...LV7_DELAY];
export const LV7_SAME_DAY_IDS: readonly string[] = LV7_SAME_DAY.map((entry) => entry.id);
export const LV7_DELAY_IDS: readonly string[] = LV7_DELAY.map((entry) => entry.id);

/** Practice examples use family/key pairs that do not appear in the official sets. */
export const LV7_DEMO_IDS: readonly string[] = ["lv7-demo-1", "lv7-demo-2"];
export const LV7_DEMO: readonly AdvancedItem[] = [
  item("lv7-demo-1", { family: "i-vi7-ii-v", key: 4 }, "sameDay", "demo", 0),
  item("lv7-demo-2", { family: "iv-iii-ii-i", key: 2 }, "sameDay", "demo", 1),
];
