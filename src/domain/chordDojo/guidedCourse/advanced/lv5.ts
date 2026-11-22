import { FAMILY_LABEL, type ProgressionFamily } from "./levels";
import { familyChords, makeItem } from "./build";
import type { AdvancedBlock, AdvancedItem } from "./types";

/**
 * P23-45 Lv5: remember and connect progressions. Ten same-day questions cover all six families; four
 * further questions start from a named middle card and ask for the rest. Two of the ten hide the cards
 * (見ずに弾く); listening to the example then becomes a hint, because the example carries information
 * the question withholds. The official set is one question per card sequence: every card must be
 * played in order.
 */
interface ProgressionSpec {
  readonly family: ProgressionFamily;
  readonly key: number;
  readonly reveal: boolean;
  readonly startIndex?: number;
}

function item(spec: ProgressionSpec, block: AdvancedBlock, id: string, part: string, setId: string): AdvancedItem {
  const chords = familyChords(spec.family, spec.key);
  const hidden = !spec.reveal;
  const start = spec.startIndex ?? 0;
  const shown = chords.slice(start);
  return makeItem({
    id,
    level: 5,
    block,
    setId,
    kind: "progression",
    part,
    family: spec.family,
    label: hidden ? "進行（見ずに弾く）" : shown.map((chord) => chord.label).join(" → "),
    detail: start > 0 ? `${shown.length}コード・${start + 1}枚目から` : `${chords.length}コード・${FAMILY_LABEL[spec.family]}`,
    chords,
    ...(start > 0 ? { startIndex: start } : {}),
    revealCards: spec.reveal,
    allowedPlaybacks: 0,
  });
}

const SAME_DAY: readonly ProgressionSpec[] = [
  { family: "major-ii-v-i", key: 0, reveal: true },
  { family: "i-v-vi-iv", key: 7, reveal: true },
  { family: "i-vi7-ii-v", key: 5, reveal: true },
  { family: "minor-ii-v-i", key: 9, reveal: true },
  { family: "iv-iii7-vi", key: 2, reveal: true },
  { family: "iv-iii-ii-i", key: 10, reveal: true },
  { family: "major-ii-v-i", key: 3, reveal: true },
  { family: "i-v-vi-iv", key: 9, reveal: true },
  { family: "i-vi7-ii-v", key: 2, reveal: false },
  { family: "iv-iii-ii-i", key: 4, reveal: false },
];

const MID: readonly ProgressionSpec[] = [
  { family: "major-ii-v-i", key: 7, reveal: true, startIndex: 1 },
  { family: "i-v-vi-iv", key: 0, reveal: true, startIndex: 2 },
  { family: "minor-ii-v-i", key: 4, reveal: true, startIndex: 1 },
  { family: "iv-iii-ii-i", key: 5, reveal: true, startIndex: 2 },
];

const DELAY: readonly ProgressionSpec[] = [
  { family: "i-v-vi-iv", key: 3, reveal: true },
  { family: "major-ii-v-i", key: 10, reveal: true },
  { family: "i-vi7-ii-v", key: 7, reveal: true },
  { family: "iv-iii7-vi", key: 9, reveal: true },
  { family: "minor-ii-v-i", key: 2, reveal: true },
];

export const LV5_SAME_DAY = SAME_DAY.map((spec, index) => item(spec, "sameDay", `lv5-sd-${String(index + 1).padStart(2, "0")}`, "progressions", "sameDay"));
export const LV5_MID = MID.map((spec, index) => item(spec, "sameDay", `lv5-mid-${String(index + 1).padStart(2, "0")}`, "mid", "sameDay"));
export const LV5_DELAY = DELAY.map((spec, index) => item(spec, "delay", `lv5-dl-${String(index + 1).padStart(2, "0")}`, "progressions", "delay"));
export const LV5_ITEMS: readonly AdvancedItem[] = [...LV5_SAME_DAY, ...LV5_MID, ...LV5_DELAY];

/** The same-day set as one attempt: ten progressions and then the four mid-card questions. */
export const LV5_SAME_DAY_IDS: readonly string[] = [...LV5_SAME_DAY, ...LV5_MID].map((entry) => entry.id);
export const LV5_DELAY_IDS: readonly string[] = LV5_DELAY.map((entry) => entry.id);

export const LV5_DEMO_IDS: readonly string[] = ["lv5-demo-1", "lv5-demo-2"];

export const LV5_DEMO: readonly AdvancedItem[] = [
  item({ family: "i-v-vi-iv", key: 4, reveal: true }, "sameDay", "lv5-demo-1", "demo", "demo"),
  item({ family: "major-ii-v-i", key: 5, reveal: true }, "sameDay", "lv5-demo-2", "demo", "demo"),
];
