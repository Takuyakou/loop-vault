import { familyChords, keyCadence, makeChord, makeItem, NOTE_NAMES, pc, voiceLed, type KeyMode } from "./build";
import { FAMILY_LABEL, type ProgressionFamily } from "./levels";
import { LV8_EXAMPLES, lv8GroupDelayIds, lv8GroupSameDayIds } from "./lv8";
import type { ChordQuality } from "../../../types";
import type { AdvancedChord, AdvancedCourseLevel, AdvancedItem } from "./types";

/**
 * P23-46 practice material. These items are practice-only (`setId: "practice"`) and are never part of
 * an official set. They give each level a short, repeatable example: two-chord comparisons, single
 * progressions of every family, the Lv7 two-to-four-chord ear pairs, the Lv8 vocabulary progressions
 * and the capstone practice charts.
 */
export interface PracticeMaterial {
  readonly id: string;
  readonly level: AdvancedCourseLevel;
  readonly kind: "pair" | "comparison" | "progression" | "sight";
  readonly label: string;
  readonly detail: string;
  readonly chords: readonly AdvancedChord[];
  readonly cadence?: readonly AdvancedChord[];
  readonly itemIds: readonly string[];
  readonly group?: string;
  readonly keyRoot?: number;
  readonly family?: ProgressionFamily;
  /** Pitch classes kept between adjacent chords (shown as 残す音). */
  readonly commonPitchClasses?: readonly number[];
  /** Moving note labels shown as 動かす音 (for example B → A). */
  readonly movedLabel?: string;
  /** Lowest-note movement shown as 最低音 A→B. */
  readonly bassMotion?: readonly [number, number];
  /** Practice sight charts keep their own tempo. */
  readonly tempoBpm?: number;
}

function commonPcs(left: AdvancedChord, right: AdvancedChord): number[] {
  return left.allowedPitchClasses.filter((value) => right.allowedPitchClasses.includes(value));
}

/* ---------------------------------------------------------------------------------------------- */
/* Lv4: common-tone and bass-motion pairs.                                                         */
/* ---------------------------------------------------------------------------------------------- */

const LV4_COMMON = makeItem({
  id: "lv4-prac-common",
  level: 4,
  block: "sameDay",
  setId: "practice",
  kind: "progression",
  part: "practice",
  label: "Cmaj7 → Am7",
  detail: "C・E・G を残したまま、B を A へ動かす",
  chords: voiceLed([makeChord({ root: 0, quality: "maj7" }), makeChord({ root: 9, quality: "min7" })]),
  revealCards: true,
  allowedPlaybacks: 0,
});

const LV4_BASS = makeItem({
  id: "lv4-prac-bass",
  level: 4,
  block: "sameDay",
  setId: "practice",
  kind: "progression",
  part: "practice",
  label: "C/E → F",
  detail: "最低音を E から F へ動かす。C は残す",
  chords: voiceLed([makeChord({ root: 0, quality: "maj", bass: 4 }), makeChord({ root: 5, quality: "maj" })]),
  revealCards: true,
  allowedPlaybacks: 0,
});

export const LV4_PRACTICE_ITEMS: readonly AdvancedItem[] = [LV4_COMMON, LV4_BASS];

/* ---------------------------------------------------------------------------------------------- */
/* Lv6: every family in every key (practice only).                                                 */
/* ---------------------------------------------------------------------------------------------- */

export const LV6_PRACTICE_FAMILIES: readonly ProgressionFamily[] = ["major-ii-v-i", "i-vi7-ii-v", "i-v-vi-iv", "iv-iii7-vi", "iv-iii-ii-i"];
export const LV12_KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

function lv6PracticeItem(family: ProgressionFamily, key: number): AdvancedItem {
  return makeItem({
    id: `lv6-prac-${family}-${key}`,
    level: 6,
    block: "sameDay",
    setId: "practice",
    kind: "transpose",
    part: "practice",
    family,
    keyRoot: key,
    label: `キー ${NOTE_NAMES[key]} · ${family}`,
    detail: "移調先のコード名は回答後に表示",
    chords: familyChords(family, key),
    revealCards: false,
    allowedPlaybacks: 0,
  });
}

export const LV6_PRACTICE_ITEMS: readonly AdvancedItem[] = LV6_PRACTICE_FAMILIES.flatMap((family) =>
  LV12_KEYS.map((key) => lv6PracticeItem(family, key)));

/* ---------------------------------------------------------------------------------------------- */
/* Lv7: two to four chord ear pairs, major and minor.                                              */
/* ---------------------------------------------------------------------------------------------- */

interface EarPracticeSpec {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly key: number;
  readonly mode: KeyMode;
  readonly chords: readonly AdvancedChord[];
}

const LV7_SPECS: readonly EarPracticeSpec[] = [
  { id: "lv7-prac-major-2", label: "2コード（長調）", detail: "Dm7 → G7", key: 0, mode: "major", chords: voiceLed([makeChord({ root: 2, quality: "min7" }), makeChord({ root: 7, quality: "dom7" })]) },
  { id: "lv7-prac-major-3", label: "3コード（長調）", detail: "Dm7 → G7 → Cmaj7", key: 0, mode: "major", chords: voiceLed([makeChord({ root: 2, quality: "min7" }), makeChord({ root: 7, quality: "dom7" }), makeChord({ root: 0, quality: "maj7" })]) },
  { id: "lv7-prac-major-4", label: "4コード（長調）", detail: "Cmaj7 → Am7 → Dm7 → G7", key: 0, mode: "major", chords: voiceLed([makeChord({ root: 0, quality: "maj7" }), makeChord({ root: 9, quality: "min7" }), makeChord({ root: 2, quality: "min7" }), makeChord({ root: 7, quality: "dom7" })]) },
  { id: "lv7-prac-minor-2", label: "2コード（短調）", detail: "Bm7♭5 → E7", key: 9, mode: "minor", chords: voiceLed([makeChord({ root: 11, quality: "min7b5" }), makeChord({ root: 4, quality: "dom7" })]) },
  { id: "lv7-prac-minor-3", label: "3コード（短調）", detail: "Bm7♭5 → E7 → Am7", key: 9, mode: "minor", chords: voiceLed([makeChord({ root: 11, quality: "min7b5" }), makeChord({ root: 4, quality: "dom7" }), makeChord({ root: 9, quality: "min7" })]) },
  { id: "lv7-prac-minor-4", label: "4コード（短調）", detail: "Am7 → Dm7 → E7 → Am7", key: 9, mode: "minor", chords: voiceLed([makeChord({ root: 9, quality: "min7" }), makeChord({ root: 2, quality: "min7" }), makeChord({ root: 4, quality: "dom7" }), makeChord({ root: 9, quality: "min7" })]) },
];

export const LV7_PRACTICE_ITEMS: readonly AdvancedItem[] = LV7_SPECS.map((spec) => makeItem({
  id: spec.id,
  level: 7,
  block: "sameDay",
  setId: "practice",
  kind: "progression",
  part: "practice",
  keyRoot: spec.key,
  prompt: "ear",
  label: spec.label,
  detail: spec.detail,
  chords: spec.chords,
  referenceChords: keyCadence(spec.key, spec.mode),
  revealCards: false,
  allowedPlaybacks: 2,
}));

/* ---------------------------------------------------------------------------------------------- */
/* P23-55: the ear stairs before Lv7 — two-chord functions, and the bass line before the chords.   */
/* ---------------------------------------------------------------------------------------------- */

/**
 * Two chords after the C cadence: the tonic, then one step away. Each pair is one distance the ear
 * learns to name (IV opens, V pulls home, vi darkens with two notes kept, …). Triads only, so the
 * function is heard and not the colour.
 */
const FUNCTION_PAIRS: readonly { readonly id: string; readonly from: readonly [number, ChordQuality]; readonly to: readonly [number, ChordQuality] }[] = [
  { id: "I-IV", from: [0, "maj"], to: [5, "maj"] },
  { id: "I-V", from: [0, "maj"], to: [7, "maj"] },
  { id: "I-vi", from: [0, "maj"], to: [9, "min"] },
  { id: "I-ii", from: [0, "maj"], to: [2, "min"] },
  { id: "I-iii", from: [0, "maj"], to: [4, "min"] },
  { id: "I-bVII", from: [0, "maj"], to: [10, "maj"] },
  { id: "IV-iv", from: [5, "maj"], to: [5, "min"] },
];

export const LV7_FUNCTION_ITEMS: readonly AdvancedItem[] = FUNCTION_PAIRS.map((pair, index) => makeItem({
  id: `lv7-prac-func-${pair.id}`,
  level: 7,
  block: "sameDay",
  setId: "practice",
  kind: "progression",
  part: "practice",
  keyRoot: 0,
  prompt: "ear",
  label: `2コードの機能 ${index + 1}`,
  detail: "2コード・キー C のカデンツを聴いてから",
  chords: voiceLed([makeChord({ root: pair.from[0], quality: pair.from[1] }), makeChord({ root: pair.to[0], quality: pair.to[1] })]),
  referenceChords: keyCadence(0),
  revealCards: false,
  allowedPlaybacks: 2,
}));

/**
 * The bass line first: the same progression, but only the lowest note is asked (the root of each chord,
 * at the bottom; anything above it is free). The example still plays the full chords. The second item of
 * each material is the full progression, so the learner hears the line, plays it, then adds the chords.
 */
interface BassLineSpec {
  readonly id: string;
  readonly label: string;
  readonly key: number;
  readonly mode: KeyMode;
  readonly chords: readonly (readonly [number, ChordQuality])[];
  /** The full-chord item played after the bass line. */
  readonly fullId: string;
}

const BASS_LINES: readonly BassLineSpec[] = [
  { id: "lv7-prac-bass-251", label: "ベースから: ii–V–I（長調）", key: 0, mode: "major", chords: [[2, "min7"], [7, "dom7"], [0, "maj7"]], fullId: "lv7-prac-major-3" },
  { id: "lv7-prac-bass-minor", label: "ベースから: iiø–V–i（短調）", key: 9, mode: "minor", chords: [[2, "min7b5"], [7, "dom7"], [0, "min7"]], fullId: "lv7-prac-minor-3" },
  { id: "lv7-prac-bass-pop", label: "ベースから: I–V–vi–IV", key: 0, mode: "major", chords: [[0, "maj"], [7, "maj"], [9, "min7"], [5, "maj7"]], fullId: "lv7-prac-pop-4" },
];

const ALL_PITCH_CLASSES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

function bassOnly(root: number, quality: ChordQuality): AdvancedChord {
  const chord = makeChord({ root, quality, checkBass: true, requiredPitchClasses: [pc(root)], allowedPitchClasses: ALL_PITCH_CLASSES });
  return { ...chord, label: `${chord.label} の根音` };
}

export const LV7_BASS_ITEMS: readonly AdvancedItem[] = BASS_LINES.map((spec) => {
  const full = voiceLed(spec.chords.map(([offset, quality]) => makeChord({ root: spec.key + offset, quality })));
  const chords = spec.chords.map(([offset, quality], index) => ({ ...bassOnly(spec.key + offset, quality), referenceNotes: full[index]!.referenceNotes }));
  return makeItem({
    id: spec.id,
    level: 7,
    block: "sameDay",
    setId: "practice",
    kind: "progression",
    part: "practice",
    keyRoot: spec.key,
    prompt: "ear",
    label: spec.label,
    detail: "ベースだけ。各和音の根音を一番下で弾く（上の音は弾かなくてよい）",
    chords,
    referenceChords: keyCadence(spec.key, spec.mode),
    revealCards: false,
    allowedPlaybacks: 2,
  });
});

/* ---------------------------------------------------------------------------------------------- */
/* P23-57: ears beyond the six families — diatonic chords in another order, and the borrowed and   */
/* secondary chords a song uses most. Practice only (the official Lv7 set stays as it is).          */
/* ---------------------------------------------------------------------------------------------- */

interface EarWideSpec {
  readonly id: string;
  readonly key: number;
  /** [offset from the key, quality] per chord. */
  readonly chords: readonly (readonly [number, ChordQuality])[];
}

/** The same diatonic chords as the families, in orders the families never use (vi first, a deceptive V → vi, iii before IV). */
const EAR_REORDERED: readonly EarWideSpec[] = [
  { id: "lv7-prac-wide-order-1", key: 0, chords: [[9, "min"], [5, "maj"], [0, "maj"], [7, "maj"]] }, // Am F C G
  { id: "lv7-prac-wide-order-2", key: 0, chords: [[2, "min7"], [7, "dom7"], [9, "min7"]] }, // Dm7 G7 Am7 (V → vi)
  { id: "lv7-prac-wide-order-3", key: 7, chords: [[0, "maj"], [4, "min"], [5, "maj"], [7, "maj"]] }, // G Bm C D
  { id: "lv7-prac-wide-order-4", key: 5, chords: [[0, "maj7"], [9, "min7"], [4, "min7"], [7, "dom7"]] }, // Fmaj7 Dm7 Am7 C7
];

/** One chord from outside the key in each: the borrowed iv, III7 (V/vi), ♭VI → ♭VII → I, the backdoor ♭VII7, II7 (V/V). */
const EAR_OUTSIDE: readonly EarWideSpec[] = [
  { id: "lv7-prac-wide-out-1", key: 0, chords: [[0, "maj"], [5, "maj"], [5, "min"], [0, "maj"]] }, // C F Fm C
  { id: "lv7-prac-wide-out-2", key: 0, chords: [[0, "maj"], [4, "dom7"], [9, "min"]] }, // C E7 Am
  { id: "lv7-prac-wide-out-3", key: 0, chords: [[8, "maj"], [10, "maj"], [0, "maj"]] }, // A♭ B♭ C
  { id: "lv7-prac-wide-out-4", key: 7, chords: [[5, "min7"], [10, "dom7"], [0, "maj7"]] }, // Cm7 F7 Gmaj7 (iv7 → ♭VII7 backdoor)
  { id: "lv7-prac-wide-out-5", key: 5, chords: [[0, "maj"], [2, "dom7"], [7, "dom7"], [0, "maj"]] }, // F G7 C7 F (V/V)
];

function earWideItem(spec: EarWideSpec, index: number, group: string): AdvancedItem {
  const chords = voiceLed(spec.chords.map(([offset, quality]) => makeChord({ root: spec.key + offset, quality })));
  return makeItem({
    id: spec.id,
    level: 7,
    block: "sameDay",
    setId: "practice",
    kind: "progression",
    part: "practice",
    keyRoot: spec.key,
    prompt: "ear",
    label: `${group} ${index + 1}`,
    detail: `${chords.length}コード・キー ${NOTE_NAMES[spec.key]} のカデンツを聴いてから`,
    chords,
    referenceChords: keyCadence(spec.key),
    revealCards: false,
    allowedPlaybacks: 2,
  });
}

export const LV7_REORDERED_ITEMS: readonly AdvancedItem[] = EAR_REORDERED.map((spec, index) => earWideItem(spec, index, "並べ替え"));
export const LV7_OUTSIDE_ITEMS: readonly AdvancedItem[] = EAR_OUTSIDE.map((spec, index) => earWideItem(spec, index, "キーの外"));

const LV7_POP_FULL = makeItem({
  id: "lv7-prac-pop-4",
  level: 7,
  block: "sameDay",
  setId: "practice",
  kind: "progression",
  part: "practice",
  keyRoot: 0,
  prompt: "ear",
  label: "4コード（長調）I–V–vi–IV",
  detail: "C → G → Am7 → Fmaj7",
  chords: familyChords("i-v-vi-iv", 0),
  referenceChords: keyCadence(0),
  revealCards: false,
  allowedPlaybacks: 2,
});

/* ---------------------------------------------------------------------------------------------- */
/* Lv8: original → coloured comparisons and short in-vocabulary progressions.                      */
/* ---------------------------------------------------------------------------------------------- */

interface Lv8PracticeSpec {
  readonly id: string;
  readonly group: "six" | "nine" | "thirteen";
  readonly label: string;
  readonly detail: string;
  readonly chords: readonly AdvancedChord[];
  readonly kind: "comparison" | "progression";
}

const LV8_SPECS: readonly Lv8PracticeSpec[] = [
  {
    id: "lv8-prac-six-compare", group: "six", kind: "comparison", label: "Csus4 → C", detail: "3度の代わりに4度。Cで3度Eに戻る",
    chords: [makeChord({ root: 0, quality: "sus4" }), makeChord({ root: 0, quality: "maj" })],
  },
  {
    id: "lv8-prac-six-progression", group: "six", kind: "progression", label: "Csus4 → C → Fadd9", detail: "sus4 から C、add9 で明るく着地",
    chords: [makeChord({ root: 0, quality: "sus4" }), makeChord({ root: 0, quality: "maj" }), makeChord({ root: 5, quality: "add9" })],
  },
  {
    id: "lv8-prac-six-progression-2", group: "six", kind: "progression", label: "Fadd9 → G6 → Cadd9", detail: "add9 と 6 を進行で聴く",
    chords: [makeChord({ root: 5, quality: "add9" }), makeChord({ root: 7, quality: "six" }), makeChord({ root: 0, quality: "add9" })],
  },
  {
    id: "lv8-prac-nine-compare", group: "nine", kind: "comparison", label: "Dm7 → Dm9", detail: "7 から 9 を足した響きへ",
    chords: [makeChord({ root: 2, quality: "min7" }), makeChord({ root: 2, quality: "min9" })],
  },
  {
    id: "lv8-prac-nine-progression", group: "nine", kind: "progression", label: "Dm9 → G9 → Cmaj9", detail: "9系だけで ii–V–I をつなぐ",
    chords: [makeChord({ root: 2, quality: "min9" }), makeChord({ root: 7, quality: "dom9" }), makeChord({ root: 0, quality: "maj9" })],
  },
  {
    id: "lv8-prac-nine-progression-2", group: "nine", kind: "progression", label: "Am9 → Dm9 → G9", detail: "9系の下行",
    chords: [makeChord({ root: 9, quality: "min9" }), makeChord({ root: 2, quality: "min9" }), makeChord({ root: 7, quality: "dom9" })],
  },
  {
    id: "lv8-prac-thirteen-compare", group: "thirteen", kind: "comparison", label: "G7 → G13", detail: "13 を足すと響きが広がる",
    chords: [makeChord({ root: 7, quality: "dom7" }), makeChord({ root: 7, quality: "dom13" })],
  },
  {
    id: "lv8-prac-thirteen-progression", group: "thirteen", kind: "progression", label: "Dm9 → G13 → Cmaj9", detail: "13 で着地へ向かう",
    chords: [makeChord({ root: 2, quality: "min9" }), makeChord({ root: 7, quality: "dom13" }), makeChord({ root: 0, quality: "maj9" })],
  },
  {
    id: "lv8-prac-thirteen-rootless", group: "thirteen", kind: "progression", label: "ルートレス: Dm9 → G13 → Cmaj9", detail: "ベースを添えてルートレス配置で通す",
    chords: [makeChord({ root: 2, quality: "min9", rootless: true }), makeChord({ root: 7, quality: "dom13", rootless: true }), makeChord({ root: 0, quality: "maj9", rootless: true })],
  },
];

export const LV8_PRACTICE_ITEMS: readonly AdvancedItem[] = LV8_SPECS.map((spec) => makeItem({
  id: spec.id,
  level: 8,
  block: "sameDay",
  setId: "practice",
  kind: "progression",
  part: "practice",
  group: spec.group,
  label: spec.label,
  detail: spec.detail,
  chords: voiceLed(spec.chords),
  revealCards: true,
  allowedPlaybacks: 0,
}));

/* ---------------------------------------------------------------------------------------------- */
/* Capstone ③: practice charts kept distinct from the official sight set.                          */
/* ---------------------------------------------------------------------------------------------- */

interface ChartSpec {
  readonly id: string;
  readonly key: number;
  readonly bpm: number;
  /** P23-54: one chord per bar, written by hand as [offset from the key, quality]. */
  readonly bars: readonly (readonly [number, ChordQuality])[];
}

const PRACTICE_CHARTS: readonly ChartSpec[] = [
  // D: Dmaj7 F#m7 Gmaj7 A7 Bm7 E7 Em7 A7 (I iii IV V7 vi V7/V ii V7)
  { id: "cap-prac-sight-1", key: 2, bpm: 70, bars: [[0, "maj7"], [4, "min7"], [5, "maj7"], [7, "dom7"], [9, "min7"], [2, "dom7"], [2, "min7"], [7, "dom7"]] },
  // B♭: B♭maj7 Gm7 E♭maj7 F7 Dm7 G7 Cm7 F7 (I vi IV V7 iii V7/ii ii V7)
  { id: "cap-prac-sight-2", key: 10, bpm: 80, bars: [[0, "maj7"], [9, "min7"], [5, "maj7"], [7, "dom7"], [4, "min7"], [9, "dom7"], [2, "min7"], [7, "dom7"]] },
];

function practiceChart(spec: ChartSpec): AdvancedItem {
  return makeItem({
    id: spec.id,
    level: "capstone",
    block: "sameDay",
    setId: "practice",
    kind: "capstone-sight",
    part: "practice",
    keyRoot: spec.key,
    label: `練習の譜面（${spec.bpm} BPM）`,
    detail: `キー ${NOTE_NAMES[spec.key]}・8小節・1小節1コード`,
    chords: voiceLed(spec.bars.map(([offset, quality]) => makeChord({ root: spec.key + offset, quality }))),
    revealCards: true,
    tempoBpm: spec.bpm,
    allowedPlaybacks: 0,
  });
}

export const CAPSTONE_PRACTICE_ITEMS: readonly AdvancedItem[] = PRACTICE_CHARTS.map(practiceChart);

/** Every practice-only item, added to the read-only bank. */
export const PRACTICE_ITEMS: readonly AdvancedItem[] = [
  ...LV4_PRACTICE_ITEMS,
  ...LV6_PRACTICE_ITEMS,
  ...LV7_PRACTICE_ITEMS,
  ...LV7_FUNCTION_ITEMS,
  ...LV7_BASS_ITEMS,
  LV7_POP_FULL,
  ...LV7_REORDERED_ITEMS,
  ...LV7_OUTSIDE_ITEMS,
  ...LV8_PRACTICE_ITEMS,
  ...CAPSTONE_PRACTICE_ITEMS,
];

/* ---------------------------------------------------------------------------------------------- */
/* The hub lists.                                                                                  */
/* ---------------------------------------------------------------------------------------------- */

const FAMILY_LABEL_MAP = FAMILY_LABEL;

/** One progression per Lv5 family, taken from the official same-day set (ids and keys are authored). */
const LV5_FAMILY_ITEM: Readonly<Record<ProgressionFamily, { readonly id: string; readonly key: number }>> = {
  "major-ii-v-i": { id: "lv5-sd-01", key: 0 },
  "i-v-vi-iv": { id: "lv5-sd-02", key: 7 },
  "i-vi7-ii-v": { id: "lv5-sd-03", key: 5 },
  "minor-ii-v-i": { id: "lv5-sd-04", key: 9 },
  "iv-iii7-vi": { id: "lv5-sd-05", key: 2 },
  "iv-iii-ii-i": { id: "lv5-sd-06", key: 10 },
};

function material(input: PracticeMaterial): PracticeMaterial {
  return input;
}

export function practiceMaterials(level: AdvancedCourseLevel, group?: string): readonly PracticeMaterial[] {
  switch (level) {
    case 4:
      return [
        material({
          id: "lv4-prac-common", level: 4, kind: "progression", label: LV4_COMMON.label, detail: LV4_COMMON.detail ?? "",
          chords: LV4_COMMON.chords, itemIds: [LV4_COMMON.id], commonPitchClasses: commonPcs(LV4_COMMON.chords[0]!, LV4_COMMON.chords[1]!), movedLabel: "B → A",
        }),
        material({
          id: "lv4-prac-bass", level: 4, kind: "progression", label: LV4_BASS.label, detail: LV4_BASS.detail ?? "",
          chords: LV4_BASS.chords, itemIds: [LV4_BASS.id], bassMotion: [pc(LV4_BASS.chords[0]!.bassPitchClass ?? 0), pc(LV4_BASS.chords[1]!.root)],
        }),
      ];
    case 5:
      return (Object.keys(LV5_FAMILY_ITEM) as ProgressionFamily[]).map((family) => {
        const entry = LV5_FAMILY_ITEM[family];
        const chords = familyChords(family, entry.key);
        return material({
          id: `lv5-prac-${family}`, level: 5, kind: "progression", label: FAMILY_LABEL_MAP[family],
          detail: chords.map((chord) => chord.label).join(" → "), chords, itemIds: [entry.id], family, keyRoot: entry.key,
        });
      });
    case 6:
      return LV6_PRACTICE_FAMILIES.map((family) => material({
        id: `lv6-prac-${family}`, level: 6, kind: "progression", label: FAMILY_LABEL_MAP[family],
        detail: "キーを選んで同じ型を弾く", chords: familyChords(family, 0), itemIds: [`lv6-prac-${family}-0`], family, keyRoot: 0,
      }));
    case 7:
      return [
        // P23-55: the stairs first — two-chord functions (seven questions in a row), then the bass line before the chords.
        material({
          id: "lv7-prac-func", level: 7, kind: "progression", label: "2コードの機能（I → ?）",
          detail: "キー C のカデンツのあと、2つ目の和音を聴いて弾く。IV・V・vi・ii・iii・♭VII と、IV → iv の 7問",
          chords: [], itemIds: LV7_FUNCTION_ITEMS.map((item) => item.id), keyRoot: 0,
        }),
        ...BASS_LINES.map((spec, index) => material({
          id: spec.id, level: 7, kind: "progression", label: spec.label,
          detail: "1問目はベースだけ（根音を一番下で）、2問目は同じ進行を和音で",
          chords: [...voiceLed(spec.chords.map(([offset, quality]) => makeChord({ root: spec.key + offset, quality })))],
          cadence: LV7_BASS_ITEMS[index]!.referenceChords ?? [], itemIds: [spec.id, spec.fullId], keyRoot: spec.key,
        })),
        // P23-57: progressions the six families do not cover, as two runs of questions.
        material({
          id: "lv7-prac-wide-order", level: 7, kind: "progression", label: "並べ替えた進行（耳）",
          detail: "同じダイアトニックの和音を、決まった型にない順で。vi から始まる・V から vi へ・iii から IV へ の 4問",
          chords: [], itemIds: LV7_REORDERED_ITEMS.map((item) => item.id), keyRoot: 0,
        }),
        material({
          id: "lv7-prac-wide-out", level: 7, kind: "progression", label: "キーの外の和音（耳）",
          detail: "借りた iv・III7・♭VI → ♭VII → I・バックドア・II7 を 1つずつ含む 5問",
          chords: [], itemIds: LV7_OUTSIDE_ITEMS.map((item) => item.id), keyRoot: 0,
        }),
        ...LV7_SPECS.map((spec) => material({
          id: spec.id, level: 7, kind: "progression", label: spec.label, detail: spec.detail,
          chords: spec.chords, cadence: keyCadence(spec.key, spec.mode), itemIds: [spec.id], keyRoot: spec.key,
        })),
      ];
    case 8: {
      const selected = group ?? "six";
      const specs = LV8_SPECS.filter((spec) => spec.group === selected).map((spec) => material({
        id: spec.id, level: 8, kind: spec.kind, label: spec.label, detail: spec.detail,
        chords: voiceLed(spec.chords), itemIds: [spec.id], group: spec.group,
      }));
      const examples = LV8_EXAMPLES.filter((item) => item.group === selected).map((item) => material({
        id: item.id, level: 8, kind: "progression", label: item.label, detail: item.detail ?? "",
        chords: item.chords, itemIds: [item.id], group: selected,
      }));
      // P23-56: the group's recolour questions, practised before (or after) the official ones. Practice evidence only.
      const recolour = [...lv8GroupSameDayIds(selected), ...lv8GroupDelayIds(selected)].filter((id) => id.includes("-ctx-") || id.includes("-dctx-"));
      return [...specs, ...examples, material({
        id: `lv8-prac-recolour-${selected}`, level: 8, kind: "progression", label: "進行の中で響きを足す",
        detail: "元の進行を聴いてから、響きを足した進行を弾く", chords: [], itemIds: recolour, group: selected,
      })];
    }
    case "capstone":
      return [
        material({ id: "cap-prac-name", level: "capstone", kind: "progression", label: "コード名を10問練習", detail: "自由練習（記録は昇格に数えません）", chords: [], itemIds: CAPSTONE_PRACTICE_NAME_IDS }),
        ...CAPSTONE_PRACTICE_ITEMS.map((item) => material({
          id: item.id, level: "capstone", kind: "sight", label: item.label, detail: item.detail ?? "",
          chords: item.chords, itemIds: [item.id], tempoBpm: item.tempoBpm,
        })),
      ];
  }
}

/** Ten capstone name questions for practice (a subset, still practice-only evidence). */
export const CAPSTONE_PRACTICE_NAME_IDS: readonly string[] = [
  "cap-name-01", "cap-name-03", "cap-name-05", "cap-name-07", "cap-name-09",
  "cap-name-13", "cap-name-15", "cap-name-17", "cap-name-19", "cap-name-21",
];

/** The key used by a Lv6 practice material for a chosen key. */
export function lv6PracticeItemId(family: ProgressionFamily, key: number): string {
  return `lv6-prac-${family}-${key}`;
}
