import type { ChordQuality } from "../../../types";
import { familyChords, keyCadence, makeChord, makeItem, NOTE_NAMES, voiceLed } from "./build";
import { type ProgressionFamily } from "./levels";
import type { AdvancedChord, AdvancedItem } from "./types";

/**
 * P23-45 総合確認 (capstone): take the learned sounds out of the course in three parts —
 * ① 24 chord-name questions covering all twelve roots, ② five unseen four-chord progressions by ear,
 * ③ three eight-bar sight-reading charts played at the learner's tempo band. The delayed day adds
 * twelve name questions and three ear questions. ① also requires 80% of its correct answers within
 * three seconds (`review.ts` reads the trial speed).
 */
const NAME_QUALITIES: readonly ChordQuality[] = [
  "maj", "min", "maj7", "min7", "dom7", "min7b5", "six", "add9", "sus4", "min9", "maj9", "dom13",
];

const NAME_QUALITIES_SECOND: readonly (readonly [ChordQuality, boolean])[] = [
  ["dom9", false], ["six", false], ["add9", false], ["maj9", true], ["min9", true], ["dom13", true],
  ["maj7", false], ["min7", false], ["dom7", false], ["sus2", false], ["min7b5", false], ["maj", false],
];

const ROOTS = [0, 5, 7, 2, 9, 10, 3, 4, 8, 11, 1, 6] as const;

function nameItem(root: number, quality: ChordQuality, rootless: boolean, index: number, block: "sameDay" | "delay", part: string, id?: string): AdvancedItem {
  const chord = makeChord({ root, quality, ...(rootless ? { rootless: true } : {}) });
  return makeItem({
    id: id ?? `cap-${block === "sameDay" ? "name" : "delay-name"}-${String(index + 1).padStart(2, "0")}`,
    level: "capstone",
    block,
    setId: block,
    kind: "capstone-name",
    part,
    label: chord.label,
    detail: "コード名から弾く",
    chords: [chord],
    revealCards: true,
    allowedPlaybacks: 0,
  });
}

export const CAPSTONE_NAME: readonly AdvancedItem[] = [
  ...ROOTS.map((root, index) => nameItem(root, NAME_QUALITIES[index]!, false, index, "sameDay", "name")),
  ...ROOTS.map((root, index) => nameItem(root, NAME_QUALITIES_SECOND[index]![0], NAME_QUALITIES_SECOND[index]![1], index + 12, "sameDay", "name")),
];

const PROGRESSIONS: readonly { family: ProgressionFamily; key: number }[] = [
  { family: "i-v-vi-iv", key: 6 },
  { family: "i-vi7-ii-v", key: 1 },
  { family: "iv-iii-ii-i", key: 8 },
  { family: "i-v-vi-iv", key: 11 },
  { family: "iv-iii-ii-i", key: 3 },
];

export const CAPSTONE_PROGRESSION: readonly AdvancedItem[] = PROGRESSIONS.map((spec, index) => makeItem({
  id: `cap-prog-${String(index + 1).padStart(2, "0")}`,
  level: "capstone",
  block: "sameDay",
  setId: "sameDay",
  kind: "capstone-progression",
  part: "progression",
  family: spec.family,
  keyRoot: spec.key,
  prompt: "ear",
  label: `初見の4コード進行 ${index + 1}`,
  detail: `キー ${NOTE_NAMES[spec.key]}・基準のカデンツのあとに聴く`,
  chords: familyChords(spec.family, spec.key),
  referenceChords: keyCadence(spec.key),
  revealCards: false,
  allowedPlaybacks: 2,
}));

interface ChartSpec {
  readonly key: number;
  readonly bpm: number;
  /** P23-54: one chord per bar, written by hand as [offset from the key, quality]. */
  readonly bars: readonly (readonly [number, ChordQuality])[];
}

/**
 * P23-54: three hand-written eight-bar charts, each a progression a song would actually use.
 * ① C: Cmaj7 Am7 Dm7 G7 Em7 A7 Dm7 G7 — a turnaround with the secondary dominant A7 (V7/ii), looping back to I.
 * ② G: Gmaj7 B7 Em7 G7 Cmaj7 Cm D7 Gmaj7 — V7/vi, V7/IV and the borrowed iv (Cm) before V7–I.
 * ③ F: Fmaj7 Am7 B♭maj7 C7 Dm7 Gm7 E♭7 Fmaj7 — the backdoor ♭VII7 (E♭7) lands on I.
 */
const CHARTS: readonly ChartSpec[] = [
  { key: 0, bpm: 70, bars: [[0, "maj7"], [9, "min7"], [2, "min7"], [7, "dom7"], [4, "min7"], [9, "dom7"], [2, "min7"], [7, "dom7"]] },
  { key: 7, bpm: 80, bars: [[0, "maj7"], [4, "dom7"], [9, "min7"], [0, "dom7"], [5, "maj7"], [5, "min"], [7, "dom7"], [0, "maj7"]] },
  { key: 5, bpm: 90, bars: [[0, "maj7"], [4, "min7"], [5, "maj7"], [7, "dom7"], [9, "min7"], [2, "min7"], [10, "dom7"], [0, "maj7"]] },
];

function chartChords(spec: ChartSpec): AdvancedChord[] {
  return voiceLed(spec.bars.map(([offset, quality]) => makeChord({ root: spec.key + offset, quality })));
}

export const CAPSTONE_SIGHT: readonly AdvancedItem[] = CHARTS.map((spec, index) => makeItem({
  id: `cap-sight-${String(index + 1).padStart(2, "0")}`,
  level: "capstone",
  block: "sameDay",
  setId: "sameDay",
  kind: "capstone-sight",
  part: "sight",
  keyRoot: spec.key,
  label: `初見 8小節 ${index + 1}（${spec.bpm} BPM）`,
  detail: `キー ${NOTE_NAMES[spec.key]}・8小節・1小節1コード`,
  chords: chartChords(spec),
  revealCards: true,
  tempoBpm: spec.bpm,
  allowedPlaybacks: 0,
}));

export const CAPSTONE_DELAY: readonly AdvancedItem[] = ROOTS.map((root, index) =>
  nameItem(root, NAME_QUALITIES[(index + 6) % NAME_QUALITIES.length]!, index % 4 === 3, index, "delay", "delay-name"));

const DELAY_EAR: readonly { label: string; key: number; chords: readonly [ChordQuality, number][] }[] = [
  { label: "V7 → I", key: 0, chords: [["dom7", 7], ["maj7", 0]] },
  { label: "IVmaj7 → I", key: 5, chords: [["maj7", 10], ["maj7", 5]] },
  { label: "ii7 → V7", key: 3, chords: [["min7", 5], ["dom7", 10]] },
];

export const CAPSTONE_DELAY_EAR: readonly AdvancedItem[] = DELAY_EAR.map((spec, index) => makeItem({
  id: `cap-delay-ear-${String(index + 1).padStart(2, "0")}`,
  level: "capstone",
  block: "delay",
  setId: "delay",
  kind: "capstone-progression",
  part: "delay-ear",
  keyRoot: spec.key,
  prompt: "ear",
  label: `別日の耳 ${index + 1}`,
  detail: `キー ${NOTE_NAMES[spec.key]}・2コード`,
  chords: voiceLed(spec.chords.map(([quality, offset]) => makeChord({ root: spec.key + offset, quality }))),
  referenceChords: keyCadence(spec.key),
  revealCards: false,
  allowedPlaybacks: 2,
}));

export const CAPSTONE_SAME_DAY: readonly AdvancedItem[] = [...CAPSTONE_NAME, ...CAPSTONE_PROGRESSION, ...CAPSTONE_SIGHT];
export const CAPSTONE_ITEMS: readonly AdvancedItem[] = [...CAPSTONE_SAME_DAY, ...CAPSTONE_DELAY, ...CAPSTONE_DELAY_EAR];

export const CAPSTONE_DEMO: readonly AdvancedItem[] = [
  nameItem(7, "dom13", false, 0, "sameDay", "demo", "cap-demo-name"),
  makeItem({
    id: "cap-demo-progression",
    level: "capstone",
    block: "sameDay",
    setId: "demo",
    kind: "capstone-progression",
    part: "demo",
    family: "i-vi7-ii-v",
    keyRoot: 5,
    prompt: "ear",
    label: "見本の4コード進行",
    detail: "キー F・基準のカデンツのあとに聴く",
    chords: familyChords("i-vi7-ii-v", 5),
    referenceChords: keyCadence(5),
    revealCards: false,
    allowedPlaybacks: 2,
  }),
];

export const CAPSTONE_NAME_IDS: readonly string[] = CAPSTONE_NAME.map((item) => item.id);
export const CAPSTONE_PROGRESSION_IDS: readonly string[] = CAPSTONE_PROGRESSION.map((item) => item.id);
export const CAPSTONE_SIGHT_IDS: readonly string[] = CAPSTONE_SIGHT.map((item) => item.id);
export const CAPSTONE_DELAY_IDS: readonly string[] = CAPSTONE_DELAY.map((item) => item.id);
export const CAPSTONE_DELAY_EAR_IDS: readonly string[] = CAPSTONE_DELAY_EAR.map((item) => item.id);
